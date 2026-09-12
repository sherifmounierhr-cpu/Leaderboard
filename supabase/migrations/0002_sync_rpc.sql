-- بوابة الكتابة الوحيدة إلى schema leaderboard.
-- schema الجداول غير مكشوف عبر الـ API، لذا تمر كل الكتابات عبر هاتين الدالتين
-- المقصورتين على service_role (أي: على Edge Function فقط).

-- ------------------------------------------------------------------
-- lb_sync — استيعاب دفعة كاملة من الشيت في معاملة واحدة
-- شكل p_payload:
-- {
--   "teams":  [ { "name": "...", "name_ar": null, "photo_url": null } ],
--   "agents": [ { "name": "...", "name_ar": null, "team": "...", "photo_url": null,
--                 "periods": [ { "quarter": 1, "target": 0, "deals": 0 } ] } ]
-- }
-- ------------------------------------------------------------------
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
begin
  -- الفرق
  with incoming as (
    select
      nullif(trim(t->>'name'), '')      as name,
      nullif(trim(t->>'name_ar'), '')   as name_ar,
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

  -- الوكلاء
  with incoming as (
    select
      nullif(trim(a->>'name'), '')      as name,
      nullif(trim(a->>'name_ar'), '')   as name_ar,
      nullif(trim(a->>'team'), '')      as team,
      nullif(trim(a->>'photo_url'), '') as photo_url
    from jsonb_array_elements(coalesce(p_payload->'agents', '[]'::jsonb)) a
  ), ins as (
    insert into leaderboard.agents (name, name_ar, team_id, photo_url, active)
    select i.name, i.name_ar, t.id, i.photo_url, true
    from incoming i
    left join leaderboard.teams t on t.name = i.team
    where i.name is not null
    on conflict (name) do update
      set name_ar   = coalesce(excluded.name_ar, leaderboard.agents.name_ar),
          team_id   = coalesce(excluded.team_id, leaderboard.agents.team_id),
          photo_url = coalesce(excluded.photo_url, leaderboard.agents.photo_url),
          active    = true
    returning 1
  )
  select count(*) into v_agents from ins;

  -- الأهداف والمبيعات لكل ربع
  create temporary table if not exists _lb_periods (
    agent_id uuid, quarter smallint, target numeric, deals numeric
  ) on commit drop;
  delete from _lb_periods;

  insert into _lb_periods (agent_id, quarter, target, deals)
  select
    ag.id,
    (p->>'quarter')::smallint,
    coalesce((p->>'target')::numeric, 0),
    coalesce((p->>'deals')::numeric, 0)
  from jsonb_array_elements(coalesce(p_payload->'agents', '[]'::jsonb)) a
  join leaderboard.agents ag on ag.name = trim(a->>'name')
  cross join lateral jsonb_array_elements(coalesce(a->'periods', '[]'::jsonb)) p;

  insert into leaderboard.targets (agent_id, year, quarter, target_egp, updated_at)
  select agent_id, p_year, quarter, target, now() from _lb_periods
  on conflict (agent_id, year, quarter) do update
    set target_egp = excluded.target_egp, updated_at = now();

  insert into leaderboard.sales (agent_id, year, quarter, amount_egp, updated_at)
  select agent_id, p_year, quarter, deals, now() from _lb_periods
  on conflict (agent_id, year, quarter) do update
    set amount_egp = excluded.amount_egp, updated_at = now();

  select count(*) into v_periods from _lb_periods;

  return jsonb_build_object('teams', v_teams, 'agents', v_agents, 'periods', v_periods);
end $fn$;

-- ------------------------------------------------------------------
-- lb_take_snapshot — غلاف عام للقطة اليومية
-- ------------------------------------------------------------------
create or replace function public.lb_take_snapshot(p_year smallint, p_quarter smallint)
returns integer
language sql
security definer
set search_path = leaderboard, public
as $fn$
  select leaderboard.take_snapshot(p_year, p_quarter);
$fn$;

-- ------------------------------------------------------------------
-- lb_log_sync — تسجيل نتيجة المزامنة
-- ------------------------------------------------------------------
create or replace function public.lb_log_sync(p_status text, p_rows integer, p_error text default null)
returns void
language sql
security definer
set search_path = leaderboard, public
as $fn$
  insert into leaderboard.sync_log (source, rows_in, status, error)
  values ('google-sheets', p_rows, p_status, p_error);
$fn$;

-- الصلاحيات: service_role فقط
revoke all on function public.lb_sync(smallint, jsonb) from public, anon, authenticated;
revoke all on function public.lb_take_snapshot(smallint, smallint) from public, anon, authenticated;
revoke all on function public.lb_log_sync(text, integer, text) from public, anon, authenticated;

grant execute on function public.lb_sync(smallint, jsonb) to service_role;
grant execute on function public.lb_take_snapshot(smallint, smallint) to service_role;
grant execute on function public.lb_log_sync(text, integer, text) to service_role;
