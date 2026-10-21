-- تاريخ الفرق ما يتغيّرش بأثر رجعي:
--
-- 1) إيقاف مستشار (active = false) كان بيشيل كل مبيعاته من إجماليات الفرق
--    وتفاصيلها في كل الأرباع (فريق Fighters في Q3 2026 ظهر بصفر بدل 46.2 مليون).
--    دلوقتي المبيعات المسجّلة بتفضل محسوبة لفريقها. الموقوف من غير مبيعات في
--    الربع الحالي بس هو اللي ما يتحسبش (لا عضو ولا تارجت).
--
-- 2) مديرين/مشرفين الفريق كانوا بيتقروا من team_leads الحالية لكل الأرباع: لما
--    مدير يتنقل لفريق تاني، اسمه بيختفي من فريقه القديم في الأرباع اللي فاتت.
--    دلوقتي قبل أي تغيير في القادة، القادة الحاليين بيتجمّدوا على كل ربع فات
--    للفريق ده (team_period_leads)، والربع الفايت بيعرض القادة المجمّدين.
--
-- 3) اسم فريق المستشار في ترتيب المستشارين للأرباع اللي فاتت: الفريق اللي باع
--    له في الربع ده، مش فريقه الحالي.

-- ------------------------------------------------------------------ القادة لكل ربع
create table if not exists leaderboard.team_period_leads (
  team_id   uuid not null references leaderboard.teams (id) on delete cascade,
  year      smallint not null,
  quarter   smallint not null check (quarter between 1 and 4),
  -- [{id, role, position}] — مصفوفة فاضية = الفريق ما كانش ليه قادة في الربع ده
  leads     jsonb not null default '[]'::jsonb,
  frozen_at timestamptz not null default now(),
  primary key (team_id, year, quarter)
);
alter table leaderboard.team_period_leads enable row level security;
drop policy if exists lb_read_all on leaderboard.team_period_leads;
create policy lb_read_all on leaderboard.team_period_leads for select to authenticated using (true);
revoke all on leaderboard.team_period_leads from anon;
grant select on leaderboard.team_period_leads to authenticated;

-- الأرباع اللي فاتت: القادة زي ما كانوا قبل تعديل 21 أكتوبر 2026 — القادة
-- الحاليين، ومعاهم أحمد خميس مدير لـ Top WOLFS (اتشال منه الصبح ده، والسجل
-- بيقول إنه كان المدير التاني بعد محمد سامي).
with cur as (
  select extract(year from now() at time zone 'Africa/Cairo')::smallint as year,
         extract(quarter from now() at time zone 'Africa/Cairo')::smallint as quarter
), periods as (
  select team_id, year, quarter from leaderboard.sales where team_id is not null
  union
  select team_id, year, quarter from leaderboard.targets where team_id is not null
)
insert into leaderboard.team_period_leads (team_id, year, quarter, leads)
select p.team_id, p.year, p.quarter,
       coalesce((
         select jsonb_agg(jsonb_build_object('id', l.agent_id, 'role', l.role, 'position', l.position)
                          order by l.role, l.position)
         from leaderboard.team_leads l where l.team_id = p.team_id
       ), '[]'::jsonb)
from periods p, cur
where (p.year, p.quarter) < (cur.year, cur.quarter)
on conflict (team_id, year, quarter) do nothing;

update leaderboard.team_period_leads f
set leads = f.leads || jsonb_build_array(jsonb_build_object('id', a.id, 'role', 'manager', 'position', 1))
from leaderboard.teams t, leaderboard.agents a
where t.id = f.team_id and t.name = 'Top WOLFS' and a.name = 'Ahmed Khamis'
  and not f.leads @> jsonb_build_array(jsonb_build_object('id', a.id));

-- قبل أي تغيير: القادة الحاليين بيتجمّدوا على الأرباع اللي فاتت (اللي لسه ما اتجمّدتش)
create or replace function public.lb_admin_set_team_leads(
  p_team_id uuid,
  p_manager_ids uuid[] default '{}',
  p_supervisor_ids uuid[] default '{}'
) returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_year smallint := extract(year from now() at time zone 'Africa/Cairo')::smallint;
  v_q    smallint := extract(quarter from now() at time zone 'Africa/Cairo')::smallint;
begin
  perform public.lb_require('teams');
  if not exists (select 1 from leaderboard.teams where id = p_team_id) then
    raise exception 'الفريق غير موجود' using errcode = 'P0002';
  end if;
  if coalesce(p_manager_ids, '{}') && coalesce(p_supervisor_ids, '{}') then
    raise exception 'نفس الشخص لا يكون مديراً ومشرفاً في نفس الفريق' using errcode = '22023';
  end if;

  insert into leaderboard.team_period_leads (team_id, year, quarter, leads)
  select p_team_id, q.year, q.quarter,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', l.agent_id, 'role', l.role, 'position', l.position)
                            order by l.role, l.position)
           from leaderboard.team_leads l where l.team_id = p_team_id
         ), '[]'::jsonb)
  from (
    select year, quarter from leaderboard.sales where team_id = p_team_id
    union
    select year, quarter from leaderboard.targets where team_id = p_team_id
  ) q
  where (q.year, q.quarter) < (v_year, v_q)
  on conflict (team_id, year, quarter) do nothing;

  delete from leaderboard.team_leads where team_id = p_team_id;

  insert into leaderboard.team_leads (team_id, agent_id, role, position)
  select p_team_id, id, 'manager', min(ord) - 1
  from unnest(coalesce(p_manager_ids, '{}')) with ordinality as m(id, ord)
  group by id;

  insert into leaderboard.team_leads (team_id, agent_id, role, position)
  select p_team_id, id, 'supervisor', min(ord) - 1
  from unnest(coalesce(p_supervisor_ids, '{}')) with ordinality as s(id, ord)
  group by id;
end $fn$;

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
  from leaderboard.targets g where g.team_id is not null
), per_member as (
  select b.team_id, b.agent_id, b.year, b.quarter, sum(b.deals) as deals, sum(b.target) as target
  from base b
  group by b.team_id, b.agent_id, b.year, b.quarter
), counted as (
  -- الموقوف بيفضل محسوب لو باع، أو لو الربع خلص (التاريخ ثابت)
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
       -- قادة الربع: المجمّدين لو الربع اتجمّد، وإلا القادة الحاليين
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
  select a_1.team_id, a_1.id, cur.year, cur.quarter, 0::numeric(14,2)
  from leaderboard.agents a_1, cur
  where a_1.active and a_1.team_id is not null and not exists (
    select 1 from leaderboard.sales s_1
    where s_1.agent_id = a_1.id and s_1.year = cur.year and s_1.quarter = cur.quarter
  )
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
left join leaderboard.targets g
  on g.agent_id = s.agent_id and g.year = s.year and g.quarter = s.quarter and g.team_id = s.team_id
-- نفس قاعدة ترتيب الفرق: مجموع التفاصيل = إجمالي الفريق
where a.active or s.amount_egp > 0 or (s.year, s.quarter) < (cur.year, cur.quarter);

-- ------------------------------------------------------------------ ترتيب المستشارين
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
join leaderboard.agents a on a.id = p.agent_id and a.active
cross join cur
-- ربع فات: الفريق اللي باع له (الأكبر)، وإلا فريق التارجت؛ الربع الحالي: فريقه دلوقتي
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
