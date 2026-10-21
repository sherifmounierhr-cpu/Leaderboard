-- تقسيم تارجت المستشار المنقول بين الفرق على حسب الوقت:
--
-- التارجت تارجت ربع (3 شهور). لو المستشار اتنقل من فريق لفريق في نص الربع،
-- كل فريق بياخد من تارجته على قد الأيام اللي قضاها فيه — مثلاً اتنقل يوم
-- 21 أكتوبر: القديم ياخد 20/92 من تارجت Q4 والجديد الباقي (72/92).
-- تارجت المستشار نفسه (في ترتيب المستشارين) ما بيتغيّرش — التقسيم بين الفرق بس.
--
-- كمان: المستشار الموقوف بيظهر عادي في ترتيب المستشارين للأرباع اللي فاتت.

-- ------------------------------------------------------------------ سجل النقل
create table if not exists leaderboard.agent_team_moves (
  id        bigserial primary key,
  agent_id  uuid not null references leaderboard.agents (id) on delete cascade,
  from_team uuid references leaderboard.teams (id) on delete set null,
  to_team   uuid references leaderboard.teams (id) on delete set null,
  moved_at  timestamptz not null default now()
);
create index if not exists agent_team_moves_agent on leaderboard.agent_team_moves (agent_id, moved_at);
alter table leaderboard.agent_team_moves enable row level security;
drop policy if exists lb_read_all on leaderboard.agent_team_moves;
create policy lb_read_all on leaderboard.agent_team_moves for select to authenticated using (true);
revoke all on leaderboard.agent_team_moves from anon;
grant select on leaderboard.agent_team_moves to authenticated;

-- أي تغيير في فريق المستشار (من الإدارة أو المزامنة) بيتسجّل نقلة
create or replace function leaderboard.record_team_move()
returns trigger
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  if new.team_id is distinct from old.team_id then
    insert into leaderboard.agent_team_moves (agent_id, from_team, to_team)
    values (new.id, old.team_id, new.team_id);
  end if;
  return new;
end $fn$;

drop trigger if exists agents_record_move on leaderboard.agents;
create trigger agents_record_move
  after update of team_id on leaderboard.agents
  for each row execute function leaderboard.record_team_move();

-- النقلات اللي حصلت قبل كده: من سجل العمليات
insert into leaderboard.agent_team_moves (agent_id, from_team, to_team, moved_at)
select a.id,
       (l.details->'changes'->'team_id'->>0)::uuid,
       (l.details->'changes'->'team_id'->>1)::uuid,
       l.at
from leaderboard.audit_log l
join leaderboard.agents a on a.name = l.label
where l.entity = 'agents' and l.action = 'update' and l.details->'changes' ? 'team_id'
  and not exists (
    select 1 from leaderboard.agent_team_moves m where m.agent_id = a.id and m.moved_at = l.at
  );

-- ------------------------------------------------------------------ نصيب كل فريق من التارجت
-- من غير نقلات جوّه الربع: التارجت كله لفريق التارجت (زي الأول). بنقلات:
-- قبل أول نقلة للفريق القديم، وبعد كل نقلة للفريق الجديد لحد النقلة اللي بعدها.
-- اليوم = تاريخ القاهرة؛ يوم النقل نفسه محسوب للفريق الجديد.
create or replace view leaderboard.target_allocations as
with g as (
  select t.agent_id, t.year, t.quarter, t.team_id, t.target_egp,
         make_date(t.year, (t.quarter - 1) * 3 + 1, 1) as q_start,
         (make_date(t.year, (t.quarter - 1) * 3 + 1, 1) + interval '3 months')::date as q_end
  from leaderboard.targets t
), mv as (
  select g.agent_id, g.year, g.quarter, g.target_egp, g.q_start, g.q_end,
         m.from_team, m.to_team, m.day,
         row_number() over w as n,
         lead(m.day) over w as next_day
  from g
  join (
    select agent_id, from_team, to_team, moved_at, (moved_at at time zone 'Africa/Cairo')::date as day
    from leaderboard.agent_team_moves
  ) m on m.agent_id = g.agent_id and m.day >= g.q_start and m.day < g.q_end
  window w as (partition by g.agent_id, g.year, g.quarter order by m.moved_at)
), segs as (
  select agent_id, year, quarter, target_egp, q_start, q_end, from_team as team_id, q_start as s, day as e
  from mv where n = 1
  union all
  select agent_id, year, quarter, target_egp, q_start, q_end, to_team, day, coalesce(next_day, q_end)
  from mv
)
select agent_id, year, quarter, team_id,
       round(target_egp * (e - s)::numeric / (q_end - q_start)::numeric, 2) as target_egp
from segs
where team_id is not null and e > s
union all
select g.agent_id, g.year, g.quarter, g.team_id, g.target_egp
from g
where g.team_id is not null
  and not exists (select 1 from mv where mv.agent_id = g.agent_id and mv.year = g.year and mv.quarter = g.quarter);

revoke all on leaderboard.target_allocations from anon;
grant select on leaderboard.target_allocations to authenticated;

-- ------------------------------------------------------------------ ترتيب الفرق
create or replace view public.lb_team_standings as
with cur as (
  select extract(year from now() at time zone 'Africa/Cairo')::smallint as year,
         extract(quarter from now() at time zone 'Africa/Cairo')::smallint as quarter
), base as (
  select s.team_id, s.agent_id, s.year, s.quarter, s.amount_egp as deals, 0::numeric as target
  from leaderboard.sales s where s.team_id is not null
  union all
  select g.team_id, g.agent_id, g.year, g.quarter, 0::numeric, g.target_egp
  from leaderboard.target_allocations g
), per_member as (
  select b.team_id, b.agent_id, b.year, b.quarter, sum(b.deals) as deals, sum(b.target) as target
  from base b
  group by b.team_id, b.agent_id, b.year, b.quarter
), counted as (
  select m.*
  from per_member m
  join leaderboard.agents a on a.id = m.agent_id
  cross join cur
  where a.active or m.deals > 0 or (m.year, m.quarter) < (cur.year, cur.quarter)
), recorded as (
  select c.team_id, c.year, c.quarter, sum(c.deals) as deals, sum(c.target) as target,
         count(*)::integer as members
  from counted c
  group by c.team_id, c.year, c.quarter
), per_team as (
  select r.team_id, r.year, r.quarter, r.deals, r.target, r.members
  from recorded r
  union all
  select t_1.id, cur.year, cur.quarter, 0::numeric, 0::numeric,
         (select count(*) from leaderboard.agents a where a.team_id = t_1.id and a.active)::integer
  from leaderboard.teams t_1, cur
  where t_1.active and not exists (
    select 1 from recorded r where r.team_id = t_1.id and r.year = cur.year and r.quarter = cur.quarter
  )
)
select p.team_id,
       t.name,
       t.name_ar,
       t.photo_url,
       p.year,
       p.quarter,
       p.deals,
       p.target,
       p.members,
       case when p.target > 0::numeric then round(p.deals / p.target * 100::numeric)::integer else 0 end as pct,
       rank() over (partition by p.year, p.quarter order by p.deals desc, t.name)::integer as rank,
       coalesce((
         select jsonb_agg(jsonb_build_object('id', a.id, 'role', x.role, 'name', a.name,
                                             'name_ar', a.name_ar, 'photo_url', a.photo_url)
                          order by x.role, x.position)
         from (
           select (e->>'id')::uuid as agent_id, e->>'role' as role, (e->>'position')::smallint as position
           from leaderboard.team_period_leads f, jsonb_array_elements(f.leads) e
           where f.team_id = t.id and f.year = p.year and f.quarter = p.quarter
           union all
           select l.agent_id, l.role, l.position
           from leaderboard.team_leads l
           where l.team_id = t.id and not exists (
             select 1 from leaderboard.team_period_leads f
             where f.team_id = t.id and f.year = p.year and f.quarter = p.quarter
           )
         ) x
         join leaderboard.agents a on a.id = x.agent_id
       ), '[]'::jsonb) as leads
from per_team p
join leaderboard.teams t on t.id = p.team_id and t.active;

-- ------------------------------------------------------------------ تفاصيل الفريق
create or replace view public.lb_team_contributions as
with cur as (
  select extract(year from now() at time zone 'Africa/Cairo')::smallint as year,
         extract(quarter from now() at time zone 'Africa/Cairo')::smallint as quarter
), rows as (
  select s_1.team_id, s_1.agent_id, s_1.year, s_1.quarter, s_1.amount_egp
  from leaderboard.sales s_1
  union all
  -- الربع الحالي: كل مستشار نشط بيظهر في فريقه الحالي حتى لو لسه ما باعش له
  -- (المنقول في نص الربع ليه سطر مبيعات في القديم بس)
  select a_1.team_id, a_1.id, cur.year, cur.quarter, 0::numeric(14,2)
  from leaderboard.agents a_1, cur
  where a_1.active and a_1.team_id is not null and not exists (
    select 1 from leaderboard.sales s_1
    where s_1.agent_id = a_1.id and s_1.year = cur.year and s_1.quarter = cur.quarter
      and s_1.team_id = a_1.team_id
  )
), alloc as (
  select agent_id, year, quarter, team_id, sum(target_egp) as target_egp
  from leaderboard.target_allocations
  group by agent_id, year, quarter, team_id
)
select s.team_id,
       t.name as team,
       t.name_ar as team_ar,
       a.id as agent_id,
       a.name,
       a.name_ar,
       a.photo_url,
       s.year,
       s.quarter,
       s.amount_egp as deals,
       coalesce(g.target_egp, 0::numeric) as target,
       case when coalesce(g.target_egp, 0::numeric) > 0::numeric
            then round(s.amount_egp / g.target_egp * 100::numeric)::integer else 0 end as pct,
       rank() over (partition by s.team_id, s.year, s.quarter order by s.amount_egp desc, a.name)::integer as rank
from rows s
join leaderboard.agents a on a.id = s.agent_id
join leaderboard.teams t on t.id = s.team_id
cross join cur
left join alloc g
  on g.agent_id = s.agent_id and g.year = s.year and g.quarter = s.quarter and g.team_id = s.team_id
where a.active or s.amount_egp > 0 or (s.year, s.quarter) < (cur.year, cur.quarter);

-- ------------------------------------------------------------------ ترتيب المستشارين
-- الموقوف بيظهر في الأرباع اللي فاتت؛ الربع الحالي للنشطين بس
create or replace view public.lb_agent_standings as
with cur as (
  select extract(year from now() at time zone 'Africa/Cairo')::smallint as year,
         extract(quarter from now() at time zone 'Africa/Cairo')::smallint as quarter
), recorded as (
  select s.agent_id, s.year, s.quarter, sum(s.amount_egp) as deals
  from leaderboard.sales s
  group by s.agent_id, s.year, s.quarter
), per_agent as (
  select r.agent_id, r.year, r.quarter, r.deals from recorded r
  union all
  select a_1.id, cur.year, cur.quarter, 0::numeric
  from leaderboard.agents a_1, cur
  where a_1.active and not exists (
    select 1 from recorded r where r.agent_id = a_1.id and r.year = cur.year and r.quarter = cur.quarter
  )
)
select a.id as agent_id,
       a.name,
       a.name_ar,
       t.name as team,
       t.name_ar as team_ar,
       a.photo_url,
       p.year,
       p.quarter,
       p.deals,
       coalesce(g.target_egp, 0::numeric) as target,
       case when coalesce(g.target_egp, 0::numeric) > 0::numeric
            then round(p.deals / g.target_egp * 100::numeric)::integer else 0 end as pct,
       rank() over (partition by p.year, p.quarter order by p.deals desc, a.name)::integer as rank
from per_agent p
cross join cur
join leaderboard.agents a
  on a.id = p.agent_id and (a.active or (p.year, p.quarter) < (cur.year, cur.quarter))
left join lateral (
  select coalesce(
    case when (p.year, p.quarter) < (cur.year, cur.quarter) then coalesce(
      (select s.team_id from leaderboard.sales s
        where s.agent_id = a.id and s.year = p.year and s.quarter = p.quarter and s.team_id is not null
        order by s.amount_egp desc, s.updated_at desc limit 1),
      (select g2.team_id from leaderboard.targets g2
        where g2.agent_id = a.id and g2.year = p.year and g2.quarter = p.quarter)
    ) end,
    a.team_id
  ) as team_id
) pt on true
left join leaderboard.teams t on t.id = pt.team_id
left join leaderboard.targets g on g.agent_id = a.id and g.year = p.year and g.quarter = p.quarter;
