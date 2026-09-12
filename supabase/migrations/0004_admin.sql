-- صفحة الإدارة: قراءة كاملة للمسؤولين + بوابة كتابة محروسة + مخزن الصور.
--
-- schema "leaderboard" يبقى غير مكشوف عبر الـ API، فتمر كل الكتابات عبر دوال
-- SECURITY DEFINER تتحقق من public.is_admin() في أول سطر. التحقق داخل الدالة
-- لا في الصلاحيات وحدها: صلاحية التنفيذ ممنوحة لـ authenticated، والحارس هو
-- ما يمنع أي مستخدم مسجَّل غير مسؤول.

-- ==================================================================
-- Views الإدارة — للمستخدمين المسجَّلين فقط (لا anon)
-- ==================================================================

-- قائمة الفروع كاملة، بما فيها غير النشطة (لا تظهر في اللوحة العامة)
create or replace view public.lb_teams
with (security_invoker = true) as
select id, name, name_ar, photo_url, active, created_at
from leaderboard.teams;

create or replace view public.lb_agents
with (security_invoker = true) as
select
  a.id,
  a.name,
  a.name_ar,
  a.team_id,
  t.name as team_name,
  a.photo_url,
  a.active,
  a.created_at
from leaderboard.agents a
left join leaderboard.teams t on t.id = a.team_id;

-- الأهداف والمبيعات معاً: full outer join لأن أحدهما قد يوجد بلا الآخر
create or replace view public.lb_periods
with (security_invoker = true) as
select
  coalesce(t.agent_id, s.agent_id)  as agent_id,
  coalesce(t.year, s.year)          as year,
  coalesce(t.quarter, s.quarter)    as quarter,
  coalesce(t.target_egp, 0)         as target_egp,
  coalesce(s.amount_egp, 0)         as amount_egp
from leaderboard.targets t
full outer join leaderboard.sales s
  on s.agent_id = t.agent_id and s.year = t.year and s.quarter = t.quarter;

revoke all on public.lb_teams, public.lb_agents, public.lb_periods from anon;
grant select on public.lb_teams, public.lb_agents, public.lb_periods to authenticated;

-- ==================================================================
-- بوابة الكتابة
-- ==================================================================

create or replace function public.lb_admin_guard()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.is_admin() then
    raise exception 'مسموح للمسؤولين فقط' using errcode = '42501';
  end if;
end $fn$;

-- ----------------------------------------------------------- الفروع
create or replace function public.lb_admin_save_team(
  p_id uuid,
  p_name text,
  p_name_ar text default null,
  p_photo_url text default null,
  p_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_id uuid;
begin
  perform public.lb_admin_guard();
  if coalesce(trim(p_name), '') = '' then
    raise exception 'اسم الفرع مطلوب' using errcode = '22023';
  end if;

  if p_id is null then
    insert into leaderboard.teams (name, name_ar, photo_url, active)
    values (trim(p_name), nullif(trim(p_name_ar), ''), nullif(trim(p_photo_url), ''), p_active)
    returning id into v_id;
  else
    update leaderboard.teams
    set name      = trim(p_name),
        name_ar   = nullif(trim(p_name_ar), ''),
        photo_url = nullif(trim(p_photo_url), ''),
        active    = p_active
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'الفرع غير موجود' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

create or replace function public.lb_admin_delete_team(p_id uuid)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  perform public.lb_admin_guard();
  -- المستشارون لا يُحذفون معه: team_id يصير null (ON DELETE SET NULL)
  delete from leaderboard.teams where id = p_id;
end $fn$;

-- ------------------------------------------------------- المستشارون
create or replace function public.lb_admin_save_agent(
  p_id uuid,
  p_name text,
  p_name_ar text default null,
  p_team_id uuid default null,
  p_photo_url text default null,
  p_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_id uuid;
begin
  perform public.lb_admin_guard();
  if coalesce(trim(p_name), '') = '' then
    raise exception 'اسم المستشار مطلوب' using errcode = '22023';
  end if;

  if p_id is null then
    insert into leaderboard.agents (name, name_ar, team_id, photo_url, active)
    values (trim(p_name), nullif(trim(p_name_ar), ''), p_team_id,
            nullif(trim(p_photo_url), ''), p_active)
    returning id into v_id;
  else
    update leaderboard.agents
    set name      = trim(p_name),
        name_ar   = nullif(trim(p_name_ar), ''),
        team_id   = p_team_id,
        photo_url = nullif(trim(p_photo_url), ''),
        active    = p_active
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'المستشار غير موجود' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

create or replace function public.lb_admin_delete_agent(p_id uuid)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  perform public.lb_admin_guard();
  -- الأهداف والمبيعات تُحذف معه (ON DELETE CASCADE)؛ اللقطات التاريخية تبقى
  delete from leaderboard.agents where id = p_id;
end $fn$;

-- ------------------------------------------- الأهداف والمبيعات للربع
create or replace function public.lb_admin_save_period(
  p_agent_id uuid,
  p_year smallint,
  p_quarter smallint,
  p_target numeric,
  p_deals numeric
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

  insert into leaderboard.targets (agent_id, year, quarter, target_egp, updated_at)
  values (p_agent_id, p_year, p_quarter, p_target, now())
  on conflict (agent_id, year, quarter) do update
    set target_egp = excluded.target_egp, updated_at = now();

  insert into leaderboard.sales (agent_id, year, quarter, amount_egp, updated_at)
  values (p_agent_id, p_year, p_quarter, p_deals, now())
  on conflict (agent_id, year, quarter) do update
    set amount_egp = excluded.amount_egp, updated_at = now();
end $fn$;

-- الصلاحيات: التنفيذ للمسجَّلين، والحارس داخل كل دالة هو ما يفصل المسؤول
revoke all on function public.lb_admin_guard() from public, anon;
revoke all on function public.lb_admin_save_team(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.lb_admin_delete_team(uuid) from public, anon;
revoke all on function public.lb_admin_save_agent(uuid, text, text, uuid, text, boolean) from public, anon;
revoke all on function public.lb_admin_delete_agent(uuid) from public, anon;
revoke all on function public.lb_admin_save_period(uuid, smallint, smallint, numeric, numeric) from public, anon;

grant execute on function public.lb_admin_save_team(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.lb_admin_delete_team(uuid) to authenticated;
grant execute on function public.lb_admin_save_agent(uuid, text, text, uuid, text, boolean) to authenticated;
grant execute on function public.lb_admin_delete_agent(uuid) to authenticated;
grant execute on function public.lb_admin_save_period(uuid, smallint, smallint, numeric, numeric) to authenticated;

-- ==================================================================
-- مخزن الصور
-- ==================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists lb_avatars_read on storage.objects;
create policy lb_avatars_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists lb_avatars_insert on storage.objects;
create policy lb_avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_admin());

drop policy if exists lb_avatars_update on storage.objects;
create policy lb_avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());

drop policy if exists lb_avatars_delete on storage.objects;
create policy lb_avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin());

-- الحارس يُستدعى من داخل دوال SECURITY DEFINER فقط، فيعمل بصلاحية المالك
-- ولا يحتاج أي منح للمستدعي. سحب التنفيذ يقلّص السطح المكشوف عبر REST.
revoke execute on function public.lb_admin_guard() from anon, authenticated, public;

-- ملاحظة لمن يقرأ تحذيرات Supabase لاحقاً:
-- دوال lb_admin_* ستظهر في المدقّق كـ "signed-in users can execute" — وهذا
-- مقصود. المنح لـ authenticated هو المدخل، والحارس داخل كل دالة هو ما يفصل
-- المسؤول عن غيره. تحويلها إلى SECURITY INVOKER يكسرها لأن الجداول في schema
-- غير مكشوف ولا صلاحيات كتابة عليه لأي دور تطبيقي.
