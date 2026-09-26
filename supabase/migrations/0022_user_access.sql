-- مستخدمو صفحة الإدارة وصلاحياتهم.
--
-- الأدوار:
--   admin    — كل شيء، ومنها إدارة المستخدمين (جدول leaderboard.admins كما هو)
--   editor   — يعدّل الأقسام المحددة له فقط (permissions)
--   readonly — يرى صفحة الإدارة كاملة بلا أي كتابة (زي حساب العرض لكن بحسابه الشخصي)
--   demo     — حساب العرض المشترك (leaderboard.demo_accounts كما هو)
--   viewer   — أي حساب مسجَّل آخر: يرى اللوحة فقط
--
-- الصلاحية تُفرض هنا لا في الواجهة: كل دالة كتابة تبدأ بـ lb_require('<القسم>')
-- بدل lb_admin_guard(). إدارة المستخدمين نفسها لا تُمنح لغير المسؤول الكامل،
-- فلا يستطيع محرّر أن يرقّي نفسه.

-- ==================================================================
-- الجدول
-- ==================================================================
create table if not exists leaderboard.user_access (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('editor', 'readonly')),
  permissions text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);
alter table leaderboard.user_access enable row level security;
revoke all on leaderboard.user_access from anon, authenticated;

-- سجل تغييرات الصلاحيات في نفس سجل الصيانة
alter table leaderboard.maintenance_log drop constraint if exists maintenance_log_kind_check;
alter table leaderboard.maintenance_log
  add constraint maintenance_log_kind_check check (kind in ('backup', 'cleanup', 'access'));

-- ==================================================================
-- الفحص
-- ==================================================================

-- أقسام صفحة الإدارة القابلة للمنح (نفس أسماء التبويبات في الواجهة)
create or replace function public.lb_permission_keys()
returns text[]
language sql
immutable
as $fn$
  select array['periods', 'deals', 'celebrate', 'messages', 'agents', 'teams',
               'reports', 'data', 'newsfeed', 'rates', 'devices', 'storage'];
$fn$;

-- يقدر يكتب في القسم؟ حساب العرض لا يكتب أبداً، و users للمسؤول الكامل وحده
create or replace function public.lb_can(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select not public.lb_is_demo() and (
    public.is_admin()
    or (p_perm <> 'users' and exists (
      select 1 from leaderboard.user_access
      where user_id = auth.uid() and role = 'editor' and p_perm = any (permissions)
    ))
  );
$fn$;

-- يقدر يرى القسم؟ (قراءة فقط تكفي)
create or replace function public.lb_can_view(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select public.is_admin() or public.lb_is_demo() or exists (
    select 1 from leaderboard.user_access
    where user_id = auth.uid()
      and (role = 'readonly' or p_perm = any (permissions))
  );
$fn$;

create or replace function public.lb_can_view_admin()
returns boolean
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select public.is_admin() or public.lb_is_demo() or exists (
    select 1 from leaderboard.user_access
    where user_id = auth.uid()
      and (role = 'readonly' or cardinality(permissions) > 0)
  );
$fn$;

-- الحارس الجديد: يكفي أن يملك واحدة من الصلاحيات الممرَّرة
create or replace function public.lb_require(variadic p_perms text[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if public.lb_is_demo() then
    raise exception 'حساب عرض — للاطلاع فقط، التعديل غير متاح' using errcode = '42501';
  end if;
  if not exists (select 1 from unnest(p_perms) p where public.lb_can(p)) then
    raise exception 'ليس لديك صلاحية تعديل هذا القسم — اطلب من المسؤول منحها لك'
      using errcode = '42501';
  end if;
end $fn$;

revoke all on function public.lb_permission_keys() from public, anon;
revoke all on function public.lb_can(text) from public, anon;
revoke all on function public.lb_can_view(text) from public, anon;
revoke all on function public.lb_can_view_admin() from public, anon;
revoke all on function public.lb_require(text[]) from public, anon, authenticated;
-- سياسات RLS والتخزين تستدعيها بصلاحية المستدعي
grant execute on function public.lb_permission_keys() to authenticated;
grant execute on function public.lb_can(text) to authenticated;
grant execute on function public.lb_can_view(text) to authenticated;
grant execute on function public.lb_can_view_admin() to authenticated;

-- ==================================================================
-- ربط كل دالة كتابة بقسمها
-- ==================================================================
-- استبدال سطر الحارس داخل التعريف الحالي لكل دالة، بدل نسخ أجسامها كلها هنا.
-- create or replace يحتفظ بالمنح الحالية. أي دالة لا يوجد فيها السطر = خطأ صريح.
do $$
declare
  m     record;
  def   text;
  next  text;
begin
  for m in
    select * from (values
      ('lb_admin_save_team',           array['teams']),
      ('lb_admin_delete_team',         array['teams']),
      ('lb_admin_set_team_leads',      array['teams']),
      ('lb_admin_save_agent',          array['agents']),
      ('lb_admin_delete_agent',        array['agents']),
      ('lb_admin_save_period',         array['periods']),
      ('lb_admin_import',              array['data']),
      ('lb_admin_log_backup',          array['storage']),
      ('lb_admin_cleanup',             array['storage']),
      ('lb_admin_save_board_settings', array['celebrate']),
      ('lb_admin_celebrate',           array['celebrate']),
      ('lb_admin_register_media',      array['celebrate', 'messages', 'newsfeed']),
      ('lb_admin_delete_media',        array['celebrate', 'messages', 'newsfeed']),
      ('lb_admin_save_announcement',   array['messages']),
      ('lb_admin_delete_announcement', array['messages']),
      ('lb_admin_add_deal',            array['deals']),
      ('lb_admin_delete_deal',         array['deals']),
      ('lb_admin_revoke_device',       array['devices']),
      ('lb_admin_restore_device',      array['devices']),
      ('lb_admin_rename_device',       array['devices']),
      ('lb_admin_delete_device',       array['devices']),
      ('lb_admin_save_cbe_rates',      array['rates']),
      ('lb_admin_save_news_settings',  array['newsfeed']),
      ('lb_admin_hide_news',           array['newsfeed']),
      ('lb_admin_show_news',           array['newsfeed']),
      ('lb_admin_cast_news',           array['newsfeed'])
    ) v (fn, perms)
  loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = m.fn;

    if def is null then
      raise exception 'الدالة % غير موجودة', m.fn;
    end if;

    next := replace(
      def,
      'perform public.lb_admin_guard();',
      format('perform public.lb_require(%s);',
             (select string_agg(quote_literal(x), ', ') from unnest(m.perms) x))
    );
    -- تشغيل الملف مرتين: السطر اتبدّل قبل كده، فلا شيء يُعاد
    if next = def and def not like '%lb_require(%' then
      raise exception 'سطر الحارس غير موجود في %', m.fn;
    end if;
    if next <> def then
      execute next;
    end if;
  end loop;
end $$;

-- الاستهلاك: قراءة فقط، لكل من يرى صفحة الإدارة (يظهر كتحذير على كل التبويبات)
do $$
declare def text;
begin
  select pg_get_functiondef('public.lb_storage_usage()'::regprocedure) into def;
  if def like '%not (public.is_admin() or public.lb_is_demo())%' then
    execute replace(def, 'not (public.is_admin() or public.lb_is_demo())', 'not public.lb_can_view_admin()');
  end if;
end $$;

-- ==================================================================
-- سياسات القراءة والتخزين
-- ==================================================================
drop policy if exists lb_devices_read on leaderboard.devices;
create policy lb_devices_read on leaderboard.devices
  for select to authenticated using (public.lb_can_view('devices'));

drop policy if exists lb_sync_log_admin on leaderboard.sync_log;
create policy lb_sync_log_admin on leaderboard.sync_log
  for select to authenticated using (public.lb_can_view('storage'));

do $$
declare
  avatars text := 'bucket_id = ''avatars'' and (public.lb_can(''agents'') or public.lb_can(''teams''))';
  media   text := 'bucket_id = ''media'' and (public.lb_can(''celebrate'') or public.lb_can(''messages'') or public.lb_can(''newsfeed''))';
begin
  execute 'drop policy if exists lb_avatars_insert on storage.objects';
  execute format('create policy lb_avatars_insert on storage.objects for insert to authenticated with check (%s)', avatars);
  execute 'drop policy if exists lb_avatars_update on storage.objects';
  execute format('create policy lb_avatars_update on storage.objects for update to authenticated using (%s) with check (%s)', avatars, avatars);
  execute 'drop policy if exists lb_avatars_delete on storage.objects';
  execute format('create policy lb_avatars_delete on storage.objects for delete to authenticated using (%s)', avatars);

  execute 'drop policy if exists lb_media_insert on storage.objects';
  execute format('create policy lb_media_insert on storage.objects for insert to authenticated with check (%s)', media);
  execute 'drop policy if exists lb_media_update on storage.objects';
  execute format('create policy lb_media_update on storage.objects for update to authenticated using (%s) with check (%s)', media, media);
  execute 'drop policy if exists lb_media_delete on storage.objects';
  execute format('create policy lb_media_delete on storage.objects for delete to authenticated using (%s)', media);
end $$;

-- ==================================================================
-- دور المستخدم الحالي للواجهة
-- ==================================================================
create or replace function public.lb_role()
returns text
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select case
    when public.lb_is_demo() then 'demo'
    when public.is_admin()   then 'admin'
    else coalesce((select role from leaderboard.user_access where user_id = auth.uid()), 'viewer')
  end;
$fn$;

-- الدور + الأقسام المسموح بتعديلها، في نداء واحد
create or replace function public.lb_my_access()
returns jsonb
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select jsonb_build_object(
    'role', public.lb_role(),
    'permissions', to_jsonb(case
      when public.lb_is_demo() then '{}'::text[]
      when public.is_admin()   then public.lb_permission_keys() || array['users']
      else coalesce((select permissions from leaderboard.user_access
                     where user_id = auth.uid() and role = 'editor'), '{}')
    end)
  );
$fn$;

revoke all on function public.lb_my_access() from public, anon;
grant execute on function public.lb_my_access() to authenticated;

-- ==================================================================
-- إدارة المستخدمين (المسؤول الكامل فقط)
-- ==================================================================
-- الإنشاء والحذف وكلمة المرور تمر عبر دالة الحافة admin-users (تحتاج
-- service_role). القراءة وتحديد الصلاحيات هنا لأنها لا تحتاجه.

create or replace function public.lb_admin_list_users()
returns table (
  id              uuid,
  email           text,
  role            text,
  permissions     text[],
  created_at      timestamptz,
  last_sign_in_at timestamptz,
  banned          boolean
)
language plpgsql
stable
security definer
set search_path = leaderboard, public
as $fn$
begin
  perform public.lb_require('users');
  return query
  select
    u.id,
    u.email::text,
    case
      when d.email is not null   then 'demo'
      when a.user_id is not null then 'admin'
      else coalesce(x.role, 'viewer')
    end,
    case when a.user_id is not null then public.lb_permission_keys() else coalesce(x.permissions, '{}') end,
    u.created_at,
    u.last_sign_in_at,
    coalesce(u.banned_until > now(), false)
  from auth.users u
  left join leaderboard.admins a        on a.user_id = u.id
  left join leaderboard.demo_accounts d on d.email = lower(u.email)
  left join leaderboard.user_access x   on x.user_id = u.id
  order by u.created_at;
end $fn$;

create or replace function public.lb_admin_set_access(
  p_user_id     uuid,
  p_role        text,
  p_permissions text[] default '{}'
) returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_email text;
  v_perms text[];
begin
  perform public.lb_require('users');

  if p_user_id = auth.uid() then
    raise exception 'لا يمكنك تغيير صلاحياتك بنفسك — اطلب ذلك من مسؤول آخر' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'editor', 'readonly', 'viewer') then
    raise exception 'دور غير معروف: %', p_role using errcode = '22023';
  end if;

  select lower(email) into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'المستخدم غير موجود' using errcode = 'P0002';
  end if;
  if exists (select 1 from leaderboard.demo_accounts where email = v_email) then
    raise exception 'حساب العرض للاطلاع فقط دائماً — صلاحياته لا تتغيّر' using errcode = '42501';
  end if;

  -- أقسام معروفة فقط، بلا تكرار، وبالترتيب الثابت
  select coalesce(array_agg(k order by ord), '{}') into v_perms
  from unnest(public.lb_permission_keys()) with ordinality as t (k, ord)
  where k = any (coalesce(p_permissions, '{}'));

  if exists (select 1 from unnest(coalesce(p_permissions, '{}')) p where p <> all (public.lb_permission_keys())) then
    raise exception 'صلاحية غير معروفة' using errcode = '22023';
  end if;
  if p_role = 'editor' and cardinality(v_perms) = 0 then
    raise exception 'اختر قسماً واحداً على الأقل للمحرّر' using errcode = '22023';
  end if;

  if p_role = 'admin' then
    insert into leaderboard.admins (user_id) values (p_user_id) on conflict do nothing;
    delete from leaderboard.user_access where user_id = p_user_id;
  else
    delete from leaderboard.admins where user_id = p_user_id;
    if p_role = 'viewer' then
      delete from leaderboard.user_access where user_id = p_user_id;
    else
      insert into leaderboard.user_access (user_id, role, permissions, updated_at, updated_by)
      values (p_user_id, p_role, case when p_role = 'editor' then v_perms else '{}' end, now(), auth.uid())
      on conflict (user_id) do update
        set role = excluded.role, permissions = excluded.permissions,
            updated_at = now(), updated_by = auth.uid();
    end if;
  end if;

  insert into leaderboard.maintenance_log (kind, details)
  values ('access', jsonb_build_object('user', v_email, 'role', p_role, 'permissions', to_jsonb(v_perms)));
end $fn$;

revoke all on function public.lb_admin_list_users() from public, anon;
revoke all on function public.lb_admin_set_access(uuid, text, text[]) from public, anon;
grant execute on function public.lb_admin_list_users() to authenticated;
grant execute on function public.lb_admin_set_access(uuid, text, text[]) to authenticated;

-- ==================================================================
-- تنظيف من مدقّق Supabase
-- ==================================================================
-- دالة event trigger من Supabase: لا تُستدعى عبر REST أصلاً، والمنح زائد
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
