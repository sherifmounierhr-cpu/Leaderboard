-- (1) أرقام الفريق لا تتبع المستشار إذا انتقل  (2) أكثر من مدير ومشرف للفريق.
--
-- ============================================================ (1) الإسناد
-- قبل هذا الملف كان مجموع الفريق يُحسب من فريق المستشار الحالي، فنقل مستشار
-- ينقل كل تاريخه معه ويُفرغ الفريق القديم. الآن كل صف مبيعات يحمل الفريق الذي
-- سُجّل له.
--
-- المدخلات (الإدارة، الاستيراد، الشيت) تبقى «إجمالي المستشار في الربع». الدالة
-- set_agent_sales تحوّل الإجمالي إلى فرق: الزيادة تُسجَّل لفريقه الحالي، والنقص
-- يُخصم من فريقه الحالي أولاً ثم من الأحدث. فمن انتقل في نصف الربع: ما باعه قبل
-- الانتقال يبقى لفريقه القديم، وما بعده لفريقه الجديد، وإجماليه لا يتغيّر.
--
-- المستهدف يبقى للفريق الذي حُدِّد له (مستهدف ربع الانتقال يبقى مع القديم).

-- ------------------------------------------------------------ الأعمدة
alter table leaderboard.sales
  add column if not exists team_id uuid references leaderboard.teams (id) on delete set null;
alter table leaderboard.targets
  add column if not exists team_id uuid references leaderboard.teams (id) on delete set null;

update leaderboard.sales s set team_id = a.team_id
from leaderboard.agents a where a.id = s.agent_id and s.team_id is null;
update leaderboard.targets g set team_id = a.team_id
from leaderboard.agents a where a.id = g.agent_id and g.team_id is null;

-- صف لكل (مستشار، ربع، فريق). NULLS NOT DISTINCT: مستشار بلا فريق له صف واحد
alter table leaderboard.sales drop constraint if exists sales_agent_id_year_quarter_key;
drop index if exists leaderboard.sales_agent_period_team_key;
create unique index sales_agent_period_team_key
  on leaderboard.sales (agent_id, year, quarter, team_id) nulls not distinct;
create index if not exists sales_team_period_idx on leaderboard.sales (team_id, year, quarter);

-- ------------------------------------------------------------ نقطة الكتابة الوحيدة
create or replace function leaderboard.set_agent_sales(
  p_agent_id uuid, p_year smallint, p_quarter smallint, p_amount numeric
) returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_team  uuid;
  v_total numeric;
  v_delta numeric;
  r       record;
  v_cut   numeric;
begin
  if p_amount < 0 then
    raise exception 'القيم لا يمكن أن تكون سالبة' using errcode = '22023';
  end if;

  select team_id into v_team from leaderboard.agents where id = p_agent_id;
  if not found then
    raise exception 'المستشار غير موجود' using errcode = 'P0002';
  end if;

  -- تصحيح ربع مضى بعد الانتقال يخص الفريق الذي سُجّل له الربع، لا الفريق الجديد
  if (p_year, p_quarter) < (
    extract(year from now() at time zone 'Africa/Cairo')::smallint,
    extract(quarter from now() at time zone 'Africa/Cairo')::smallint
  ) then
    select coalesce((
      select team_id from leaderboard.sales
      where agent_id = p_agent_id and year = p_year and quarter = p_quarter
      order by updated_at desc limit 1
    ), v_team) into v_team;
  end if;

  -- قفل صفوف المستشار في الربع: حفظان متزامنان لا يحسبان نفس الفرق مرتين
  perform 1 from leaderboard.sales
  where agent_id = p_agent_id and year = p_year and quarter = p_quarter
  for update;

  select coalesce(sum(amount_egp), 0) into v_total from leaderboard.sales
  where agent_id = p_agent_id and year = p_year and quarter = p_quarter;

  v_delta := p_amount - v_total;

  if v_delta > 0 or not exists (
    select 1 from leaderboard.sales where agent_id = p_agent_id and year = p_year and quarter = p_quarter
  ) then
    insert into leaderboard.sales (agent_id, year, quarter, team_id, amount_egp, updated_at)
    values (p_agent_id, p_year, p_quarter, v_team, greatest(v_delta, 0), now())
    on conflict (agent_id, year, quarter, team_id) do update
      set amount_egp = leaderboard.sales.amount_egp + excluded.amount_egp, updated_at = now();
    return;
  end if;

  if v_delta = 0 then
    return;
  end if;

  -- نقص (تصحيح): من الفريق الحالي أولاً، ثم الأحدث تحديثاً
  v_delta := -v_delta;
  for r in
    select id, amount_egp from leaderboard.sales
    where agent_id = p_agent_id and year = p_year and quarter = p_quarter and amount_egp > 0
    order by (team_id is not distinct from v_team) desc, updated_at desc
  loop
    exit when v_delta <= 0;
    v_cut := least(r.amount_egp, v_delta);
    update leaderboard.sales set amount_egp = amount_egp - v_cut, updated_at = now() where id = r.id;
    v_delta := v_delta - v_cut;
  end loop;
end $fn$;

revoke all on function leaderboard.set_agent_sales(uuid, smallint, smallint, numeric) from public, anon, authenticated;

-- ------------------------------------------------------------ دوال الكتابة
create or replace function public.lb_admin_save_period(
  p_agent_id uuid, p_year smallint, p_quarter smallint, p_target numeric, p_deals numeric
) returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  perform public.lb_admin_guard();
  if p_quarter not between 1 and 4 then
    raise exception 'الربع يجب أن يكون بين 1 و 4' using errcode = '22023';
  end if;
  if p_target < 0 or p_deals < 0 then
    raise exception 'القيم لا يمكن أن تكون سالبة' using errcode = '22023';
  end if;

  -- المستهدف يُسند لفريق المستشار عند أول تحديد فقط، ولا يتبعه لو انتقل
  insert into leaderboard.targets (agent_id, year, quarter, team_id, target_egp, updated_at)
  values (p_agent_id, p_year, p_quarter, (select team_id from leaderboard.agents where id = p_agent_id), p_target, now())
  on conflict (agent_id, year, quarter) do update
    set target_egp = excluded.target_egp, updated_at = now();

  perform leaderboard.set_agent_sales(p_agent_id, p_year, p_quarter, p_deals);
end $fn$;

create or replace function public.lb_sync(p_year smallint, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_teams   integer := 0;
  v_agents  integer := 0;
  v_periods integer := 0;
  r         record;
begin
  with incoming as (
    select nullif(trim(t->>'name'), '') as name, nullif(trim(t->>'name_ar'), '') as name_ar,
           nullif(trim(t->>'photo_url'), '') as photo_url
    from jsonb_array_elements(coalesce(p_payload->'teams', '[]'::jsonb)) t
  ), ins as (
    insert into leaderboard.teams (name, name_ar, photo_url, active)
    select name, name_ar, photo_url, true from incoming where name is not null
    on conflict (name) do update
      set name_ar   = coalesce(excluded.name_ar, leaderboard.teams.name_ar),
          photo_url = coalesce(excluded.photo_url, leaderboard.teams.photo_url),
          active    = true
    returning 1
  )
  select count(*) into v_teams from ins;

  with incoming as (
    select nullif(trim(a->>'name'), '') as name, nullif(trim(a->>'name_ar'), '') as name_ar,
           nullif(trim(a->>'team'), '') as team, nullif(trim(a->>'photo_url'), '') as photo_url
    from jsonb_array_elements(coalesce(p_payload->'agents', '[]'::jsonb)) a
  ), ins as (
    insert into leaderboard.agents (name, name_ar, team_id, photo_url, active)
    select i.name, i.name_ar, t.id, i.photo_url, true
    from incoming i left join leaderboard.teams t on t.name = i.team
    where i.name is not null
    on conflict (name) do update
      set name_ar   = coalesce(excluded.name_ar, leaderboard.agents.name_ar),
          team_id   = coalesce(excluded.team_id, leaderboard.agents.team_id),
          photo_url = coalesce(excluded.photo_url, leaderboard.agents.photo_url),
          active    = true
    returning 1
  )
  select count(*) into v_agents from ins;

  -- بعد تحديث فرق المستشارين: الزيادة تُسند لفريق الملف الجديد
  for r in
    select ag.id as agent_id, (p->>'quarter')::smallint as quarter,
           coalesce((p->>'target')::numeric, 0) as target, coalesce((p->>'deals')::numeric, 0) as deals
    from jsonb_array_elements(coalesce(p_payload->'agents', '[]'::jsonb)) a
    join leaderboard.agents ag on ag.name = trim(a->>'name')
    cross join lateral jsonb_array_elements(coalesce(a->'periods', '[]'::jsonb)) p
  loop
    insert into leaderboard.targets (agent_id, year, quarter, team_id, target_egp, updated_at)
    values (r.agent_id, p_year, r.quarter, (select team_id from leaderboard.agents where id = r.agent_id), r.target, now())
    on conflict (agent_id, year, quarter) do update
      set target_egp = excluded.target_egp, updated_at = now();
    perform leaderboard.set_agent_sales(r.agent_id, p_year, r.quarter, r.deals);
    v_periods := v_periods + 1;
  end loop;

  return jsonb_build_object('teams', v_teams, 'agents', v_agents, 'periods', v_periods);
end $fn$;

-- حدث «صفقة جديدة»: الإجمالي المعروض إجمالي المستشار لا صف الفريق وحده
create or replace function leaderboard.record_sale_event()
returns trigger
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_now    timestamp := now() at time zone 'Africa/Cairo';
  v_year   smallint  := extract(year from v_now);
  v_q      smallint  := extract(quarter from v_now);
  v_before numeric   := case when tg_op = 'UPDATE' then old.amount_egp else 0 end;
  v_total  numeric;
begin
  if new.amount_egp > v_before and new.year = v_year and new.quarter = v_q then
    select coalesce(sum(amount_egp), 0) into v_total from leaderboard.sales
    where agent_id = new.agent_id and year = new.year and quarter = new.quarter;
    insert into leaderboard.sale_events (agent_id, year, quarter, kind, amount_egp, total_egp, created_by)
    values (new.agent_id, new.year, new.quarter, 'sale', new.amount_egp - v_before, v_total, auth.uid());
  end if;
  return new;
end $fn$;

create or replace function public.lb_admin_celebrate(p_agent_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_now   timestamp := now() at time zone 'Africa/Cairo';
  v_year  smallint  := extract(year from v_now);
  v_q     smallint  := extract(quarter from v_now);
  v_note  text      := nullif(btrim(p_note), '');
  v_total numeric;
begin
  perform public.lb_admin_guard();
  if not exists (select 1 from leaderboard.agents where id = p_agent_id) then
    raise exception 'المستشار غير موجود' using errcode = '22023';
  end if;
  if char_length(v_note) > 140 then
    raise exception 'الرسالة أطول من 140 حرفاً' using errcode = '22023';
  end if;
  select sum(amount_egp) into v_total from leaderboard.sales
  where agent_id = p_agent_id and year = v_year and quarter = v_q;
  insert into leaderboard.sale_events (agent_id, year, quarter, kind, total_egp, note, created_by)
  values (p_agent_id, v_year, v_q, 'manual', coalesce(v_total, 0), v_note, auth.uid());
end $fn$;

-- ============================================================ (2) قيادة متعددة
create table if not exists leaderboard.team_leads (
  team_id    uuid not null references leaderboard.teams (id) on delete cascade,
  agent_id   uuid not null references leaderboard.agents (id) on delete cascade,
  role       text not null check (role in ('manager', 'supervisor')),
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  -- الشخص بدور واحد داخل الفريق الواحد
  primary key (team_id, agent_id)
);
alter table leaderboard.team_leads enable row level security;
drop policy if exists lb_read_all on leaderboard.team_leads;
create policy lb_read_all on leaderboard.team_leads for select to authenticated using (true);
revoke all on leaderboard.team_leads from anon;
grant select on leaderboard.team_leads to authenticated;

-- نقل القيم الحالية ثم حذف العمودين (والـ views التي تعتمد عليهما تُعاد بناؤها)
insert into leaderboard.team_leads (team_id, agent_id, role, position)
select id, manager_agent_id, 'manager', 0 from leaderboard.teams where manager_agent_id is not null
on conflict do nothing;
insert into leaderboard.team_leads (team_id, agent_id, role, position)
select id, supervisor_agent_id, 'supervisor', 0 from leaderboard.teams where supervisor_agent_id is not null
on conflict do nothing;

drop view if exists public.lb_teams;
drop view if exists public.lb_team_standings;
drop view if exists public.lb_agent_standings;
drop view if exists public.lb_periods;
drop function if exists public.lb_admin_set_team_leads(uuid, uuid, uuid);

alter table leaderboard.teams drop constraint if exists teams_leads_distinct;
alter table leaderboard.teams drop column if exists manager_agent_id;
alter table leaderboard.teams drop column if exists supervisor_agent_id;

create or replace function public.lb_admin_set_team_leads(
  p_team_id uuid,
  p_manager_ids uuid[] default '{}',
  p_supervisor_ids uuid[] default '{}'
) returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  perform public.lb_admin_guard();
  if not exists (select 1 from leaderboard.teams where id = p_team_id) then
    raise exception 'الفريق غير موجود' using errcode = 'P0002';
  end if;
  if coalesce(p_manager_ids, '{}') && coalesce(p_supervisor_ids, '{}') then
    raise exception 'نفس الشخص لا يكون مديراً ومشرفاً في نفس الفريق' using errcode = '22023';
  end if;

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

revoke all on function public.lb_admin_set_team_leads(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.lb_admin_set_team_leads(uuid, uuid[], uuid[]) to authenticated;

-- ============================================================ القراءة
create view public.lb_teams with (security_invoker = true) as
select t.id, t.name, t.name_ar, t.photo_url, t.active, t.created_at,
  coalesce(array(select l.agent_id from leaderboard.team_leads l
                 where l.team_id = t.id and l.role = 'manager' order by l.position), '{}') as manager_ids,
  coalesce(array(select l.agent_id from leaderboard.team_leads l
                 where l.team_id = t.id and l.role = 'supervisor' order by l.position), '{}') as supervisor_ids
from leaderboard.teams t;

-- المستشار: مجموع صفوفه في كل الفرق — إجماليه لا يتأثر بالانتقال
create view public.lb_agent_standings with (security_invoker = true) as
with per_agent as (
  select s.agent_id, s.year, s.quarter, sum(s.amount_egp) as deals
  from leaderboard.sales s
  group by s.agent_id, s.year, s.quarter
)
select a.id as agent_id, a.name, a.name_ar, t.name as team, t.name_ar as team_ar, a.photo_url,
  p.year, p.quarter,
  p.deals,
  coalesce(g.target_egp, 0) as target,
  case when coalesce(g.target_egp, 0) > 0 then round(p.deals / g.target_egp * 100)::int else 0 end as pct,
  rank() over (partition by p.year, p.quarter order by p.deals desc, a.name)::int as rank
from per_agent p
join leaderboard.agents a on a.id = p.agent_id and a.active
left join leaderboard.teams t on t.id = a.team_id
left join leaderboard.targets g on g.agent_id = a.id and g.year = p.year and g.quarter = p.quarter;

-- الفريق: من الفريق المسجَّل على الصف، لا فريق المستشار الحالي
create view public.lb_team_standings with (security_invoker = true) as
with sales_by_team as (
  select s.team_id, s.year, s.quarter, sum(s.amount_egp) as deals, array_agg(distinct s.agent_id) as agent_ids
  from leaderboard.sales s
  join leaderboard.agents a on a.id = s.agent_id and a.active
  where s.team_id is not null
  group by s.team_id, s.year, s.quarter
), targets_by_team as (
  select g.team_id, g.year, g.quarter, sum(g.target_egp) as target, array_agg(distinct g.agent_id) as agent_ids
  from leaderboard.targets g
  join leaderboard.agents a on a.id = g.agent_id and a.active
  where g.team_id is not null
  group by g.team_id, g.year, g.quarter
), per_team as (
  select coalesce(s.team_id, g.team_id) as team_id,
         coalesce(s.year, g.year) as year,
         coalesce(s.quarter, g.quarter) as quarter,
         coalesce(s.deals, 0) as deals,
         coalesce(g.target, 0) as target,
         (select count(distinct x) from unnest(coalesce(s.agent_ids, '{}') || coalesce(g.agent_ids, '{}')) x)::int as members
  from sales_by_team s
  full join targets_by_team g on g.team_id = s.team_id and g.year = s.year and g.quarter = s.quarter
)
select p.team_id, t.name, t.name_ar, t.photo_url, p.year, p.quarter, p.deals, p.target, p.members,
  case when p.target > 0 then round(p.deals / p.target * 100)::int else 0 end as pct,
  rank() over (partition by p.year, p.quarter order by p.deals desc, t.name)::int as rank,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'role', l.role, 'name', a.name,
                                        'name_ar', a.name_ar, 'photo_url', a.photo_url)
                     order by l.role, l.position)
    from leaderboard.team_leads l join leaderboard.agents a on a.id = l.agent_id
    where l.team_id = t.id
  ), '[]'::jsonb) as leads
from per_team p
join leaderboard.teams t on t.id = p.team_id and t.active;

-- مساهمة كل مستشار في كل فريق — لتقرير الفريق (يشمل من انتقل منه)
create or replace view public.lb_team_contributions with (security_invoker = true) as
select s.team_id, t.name as team, t.name_ar as team_ar,
  a.id as agent_id, a.name, a.name_ar, a.photo_url, s.year, s.quarter,
  s.amount_egp as deals,
  coalesce(g.target_egp, 0) as target,
  case when coalesce(g.target_egp, 0) > 0 then round(s.amount_egp / g.target_egp * 100)::int else 0 end as pct,
  rank() over (partition by s.team_id, s.year, s.quarter order by s.amount_egp desc, a.name)::int as rank
from leaderboard.sales s
join leaderboard.agents a on a.id = s.agent_id and a.active
join leaderboard.teams t on t.id = s.team_id
left join leaderboard.targets g
  on g.agent_id = s.agent_id and g.year = s.year and g.quarter = s.quarter and g.team_id = s.team_id;

-- الإدارة: الإجمالي لكل مستشار (ما يُعدَّل في الجدول)
create view public.lb_periods with (security_invoker = true) as
with s as (
  select agent_id, year, quarter, sum(amount_egp) as amount_egp
  from leaderboard.sales group by agent_id, year, quarter
)
select coalesce(t.agent_id, s.agent_id) as agent_id,
       coalesce(t.year, s.year) as year,
       coalesce(t.quarter, s.quarter) as quarter,
       coalesce(t.target_egp, 0) as target_egp,
       coalesce(s.amount_egp, 0) as amount_egp
from leaderboard.targets t
full outer join s on s.agent_id = t.agent_id and s.year = t.year and s.quarter = t.quarter;

revoke all on public.lb_teams, public.lb_team_standings, public.lb_agent_standings,
              public.lb_team_contributions, public.lb_periods from anon;
grant select on public.lb_teams, public.lb_team_standings, public.lb_agent_standings,
               public.lb_team_contributions, public.lb_periods to authenticated;
