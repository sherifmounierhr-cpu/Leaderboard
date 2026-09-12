-- Everest Leaderboard — schema الأساسي
-- الجداول تعيش في schema "leaderboard" غير المكشوف عبر الـ API.
-- الفرونت يقرأ فقط من الـ views في schema "public" (بادئة lb_).

create schema if not exists leaderboard;

-- ---------------------------------------------------------------- teams
create table if not exists leaderboard.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  name_ar     text,
  photo_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------- agents
create table if not exists leaderboard.agents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  name_ar     text,
  team_id     uuid references leaderboard.teams (id) on delete set null,
  photo_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists agents_team_idx on leaderboard.agents (team_id);

-- -------------------------------------------------------------- targets
create table if not exists leaderboard.targets (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references leaderboard.agents (id) on delete cascade,
  year        smallint not null,
  quarter     smallint not null check (quarter between 1 and 4),
  target_egp  numeric(14, 2) not null default 0 check (target_egp >= 0),
  updated_at  timestamptz not null default now(),
  unique (agent_id, year, quarter)
);

-- ---------------------------------------------------------------- sales
create table if not exists leaderboard.sales (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references leaderboard.agents (id) on delete cascade,
  year        smallint not null,
  quarter     smallint not null check (quarter between 1 and 4),
  amount_egp  numeric(14, 2) not null default 0 check (amount_egp >= 0),
  updated_at  timestamptz not null default now(),
  unique (agent_id, year, quarter)
);
create index if not exists sales_period_idx on leaderboard.sales (year, quarter);

-- ------------------------------------------------------------ snapshots
-- لقطة يومية تغذي أسهم تغير الترتيب والرسوم البيانية.
create table if not exists leaderboard.snapshots (
  id           bigint generated always as identity primary key,
  taken_on     date not null default current_date,
  scope        text not null check (scope in ('team', 'agent')),
  entity_id    uuid not null,
  entity_name  text not null,
  year         smallint not null,
  quarter      smallint not null,
  deals        numeric(14, 2) not null default 0,
  target       numeric(14, 2) not null default 0,
  rank         integer not null,
  unique (taken_on, scope, entity_id, year, quarter)
);
create index if not exists snapshots_lookup_idx
  on leaderboard.snapshots (scope, year, quarter, taken_on desc);

-- ------------------------------------------------------------- sync_log
create table if not exists leaderboard.sync_log (
  id        bigint generated always as identity primary key,
  ran_at    timestamptz not null default now(),
  source    text not null default 'google-sheets',
  rows_in   integer not null default 0,
  status    text not null check (status in ('ok', 'error')),
  error     text
);

-- ==================================================================
-- Views العامة (للقراءة فقط)
-- ==================================================================

create or replace view public.lb_agent_standings
with (security_invoker = true) as
select
  a.id                                            as agent_id,
  a.name,
  a.name_ar,
  t.name                                          as team,
  t.name_ar                                       as team_ar,
  a.photo_url,
  s.year,
  s.quarter,
  coalesce(s.amount_egp, 0)                       as deals,
  coalesce(g.target_egp, 0)                       as target,
  case
    when coalesce(g.target_egp, 0) > 0
    then round(coalesce(s.amount_egp, 0) / g.target_egp * 100)::int
    else 0
  end                                             as pct,
  rank() over (
    partition by s.year, s.quarter
    order by coalesce(s.amount_egp, 0) desc, a.name
  )::int                                          as rank
from leaderboard.sales s
join leaderboard.agents a on a.id = s.agent_id and a.active
left join leaderboard.teams t on t.id = a.team_id
left join leaderboard.targets g
  on g.agent_id = a.id and g.year = s.year and g.quarter = s.quarter;

create or replace view public.lb_team_standings
with (security_invoker = true) as
with per_team as (
  select
    t.id                        as team_id,
    t.name,
    t.name_ar,
    t.photo_url,
    s.year,
    s.quarter,
    sum(coalesce(s.amount_egp, 0))  as deals,
    sum(coalesce(g.target_egp, 0))  as target,
    count(distinct a.id)::int       as members
  from leaderboard.sales s
  join leaderboard.agents a on a.id = s.agent_id and a.active
  join leaderboard.teams t on t.id = a.team_id and t.active
  left join leaderboard.targets g
    on g.agent_id = a.id and g.year = s.year and g.quarter = s.quarter
  group by t.id, t.name, t.name_ar, t.photo_url, s.year, s.quarter
)
select
  team_id,
  name,
  name_ar,
  photo_url,
  year,
  quarter,
  deals,
  target,
  members,
  case when target > 0 then round(deals / target * 100)::int else 0 end as pct,
  rank() over (partition by year, quarter order by deals desc, name)::int as rank
from per_team;

-- تاريخ الترتيب للرسوم البيانية
create or replace view public.lb_rank_history
with (security_invoker = true) as
select taken_on, scope, entity_id, entity_name, year, quarter, deals, target, rank
from leaderboard.snapshots;

-- آخر لقطة سابقة لكل كيان — أساس حساب أسهم الصعود/الهبوط
create or replace view public.lb_previous_ranks
with (security_invoker = true) as
select distinct on (scope, entity_id, year, quarter)
  scope, entity_id, entity_name, year, quarter, rank, taken_on
from leaderboard.snapshots
where taken_on < current_date
order by scope, entity_id, year, quarter, taken_on desc;

-- ==================================================================
-- الصلاحيات و RLS
-- ==================================================================

alter table leaderboard.teams      enable row level security;
alter table leaderboard.agents     enable row level security;
alter table leaderboard.targets    enable row level security;
alter table leaderboard.sales      enable row level security;
alter table leaderboard.snapshots  enable row level security;
alter table leaderboard.sync_log   enable row level security;

grant usage on schema leaderboard to anon, authenticated;
grant select on leaderboard.teams, leaderboard.agents, leaderboard.targets,
                leaderboard.sales, leaderboard.snapshots
  to anon, authenticated;

do $do$
declare
  tbl text;
begin
  foreach tbl in array array['teams', 'agents', 'targets', 'sales', 'snapshots']
  loop
    execute format('drop policy if exists lb_read_all on leaderboard.%I', tbl);
    execute format('create policy lb_read_all on leaderboard.%I for select to anon, authenticated using (true)', tbl);
  end loop;
end $do$;

-- sync_log مرئي للمسؤولين فقط
drop policy if exists lb_sync_log_admin on leaderboard.sync_log;
create policy lb_sync_log_admin on leaderboard.sync_log
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

-- لا سياسات كتابة: كل insert/update/delete يمر عبر service_role فقط.

grant select on public.lb_agent_standings, public.lb_team_standings,
                public.lb_rank_history, public.lb_previous_ranks
  to anon, authenticated;

-- ==================================================================
-- التقاط اللقطة اليومية
-- ==================================================================
create or replace function leaderboard.take_snapshot(p_year smallint, p_quarter smallint)
returns integer
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  n integer;
begin
  insert into leaderboard.snapshots
    (taken_on, scope, entity_id, entity_name, year, quarter, deals, target, rank)
  select current_date, 'team', team_id, name, year, quarter, deals, target, rank
  from public.lb_team_standings
  where year = p_year and quarter = p_quarter
  on conflict (taken_on, scope, entity_id, year, quarter) do update
    set deals = excluded.deals, target = excluded.target, rank = excluded.rank;

  insert into leaderboard.snapshots
    (taken_on, scope, entity_id, entity_name, year, quarter, deals, target, rank)
  select current_date, 'agent', agent_id, name, year, quarter, deals, target, rank
  from public.lb_agent_standings
  where year = p_year and quarter = p_quarter
  on conflict (taken_on, scope, entity_id, year, quarter) do update
    set deals = excluded.deals, target = excluded.target, rank = excluded.rank;

  select count(*) into n
  from leaderboard.snapshots
  where taken_on = current_date and year = p_year and quarter = p_quarter;

  return n;
end $fn$;

revoke all on function leaderboard.take_snapshot(smallint, smallint) from public;

-- ==================================================================
-- Realtime: يبث تغير المبيعات للمتصفح بدل الـ polling
-- ==================================================================
do $rt$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'leaderboard' and tablename = 'sales'
    ) then
      execute 'alter publication supabase_realtime add table leaderboard.sales';
    end if;
  end if;
end $rt$;
