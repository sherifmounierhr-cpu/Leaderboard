-- حسابات الإداريين والمديرين الإداريين.
--
-- دوران جديدان، زي «محرّر» بالظبط (الأقسام بتتختار لكل حساب):
--   staff          — إداري
--   staff_manager  — مدير إداري
--
-- وصلاحية جديدة تتمنح للمدير الإداري بس: staff_accounts («إدارة حسابات
-- الإداريين»). اللي معاه يقدر يعمل حسابات «إداري» ويعدّلها ويوقفها ويحذفها
-- ويغيّر كلمة سرها — بشروط مفروضة هنا مش في الواجهة:
--   • الدور اللي بيحطه «إداري» بس (لا مدير إداري ولا محرّر ولا مسؤول).
--   • الحساب اللي بيعدّله لازم يكون «إداري» أصلاً (أو جديد لسه ما اتحددش).
--   • الأقسام اللي بيديها من الأقسام اللي معاه هو بس.
--   • سجل العمليات وباقي المستخدمين للمسؤول الكامل وحده.

alter table leaderboard.user_access drop constraint if exists user_access_role_check;
alter table leaderboard.user_access
  add constraint user_access_role_check check (role in ('editor', 'readonly', 'staff', 'staff_manager'));

-- الأدوار اللي ليها أقسام مختارة
create or replace function public.lb_section_roles()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array['editor', 'staff', 'staff_manager'];
$fn$;

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
      where user_id = auth.uid() and role = any (public.lb_section_roles()) and p_perm = any (permissions)
    ))
  );
$fn$;

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
                     where user_id = auth.uid() and role = any (public.lb_section_roles())), '{}')
    end)
  );
$fn$;

-- مدير إداري معاه «إدارة حسابات الإداريين»؟
create or replace function public.lb_staff_manager()
returns boolean
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select not public.lb_is_demo() and exists (
    select 1 from leaderboard.user_access
    where user_id = auth.uid() and role = 'staff_manager' and 'staff_accounts' = any (permissions)
  );
$fn$;

-- يقدر يدير الحساب ده؟ المسؤول: أي حساب. المدير الإداري: حسابات «إداري» بس، مش نفسه.
create or replace function public.lb_can_manage_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select public.lb_can('users') or (
    public.lb_staff_manager()
    and p_user_id <> auth.uid()
    and not exists (select 1 from leaderboard.admins where user_id = p_user_id)
    and exists (select 1 from leaderboard.user_access where user_id = p_user_id and role = 'staff')
  );
$fn$;

revoke all on function public.lb_section_roles() from public, anon;
revoke all on function public.lb_staff_manager() from public, anon;
revoke all on function public.lb_can_manage_user(uuid) from public, anon;
grant execute on function public.lb_section_roles() to authenticated;
grant execute on function public.lb_staff_manager() to authenticated;
grant execute on function public.lb_can_manage_user(uuid) to authenticated;

-- القائمة: المسؤول يشوف الكل، والمدير الإداري يشوف الإداريين بس
create or replace function public.lb_admin_list_users()
returns table(id uuid, email text, username text, role text, permissions text[],
              created_at timestamptz, last_sign_in_at timestamptz, banned boolean)
language plpgsql
stable
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_all boolean := public.lb_can('users');
begin
  if not v_all and not public.lb_staff_manager() then
    perform public.lb_require('users');
  end if;
  return query
  select
    u.id,
    case when u.email like '%@noemail.everest-leaderboard.app' then null else u.email::text end,
    n.username,
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
  left join leaderboard.usernames n     on n.user_id = u.id
  where v_all or (x.role = 'staff' and a.user_id is null and d.email is null)
  order by u.created_at;
end $fn$;

create or replace function public.lb_admin_set_access(p_user_id uuid, p_role text, p_permissions text[] default '{}')
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_email   text;
  v_perms   text[];
  v_allowed text[];
  v_mine    text[];
begin
  if not public.lb_can('users') then
    if not public.lb_staff_manager() then
      perform public.lb_require('users');
    end if;
    -- مدير إداري: «إداري» بس، على حساب جديد أو «إداري» أصلاً، ومن أقسامه هو
    if p_role <> 'staff' then
      raise exception 'المدير الإداري يقدر يعمل حسابات «إداري» بس' using errcode = '42501';
    end if;
    if exists (select 1 from leaderboard.admins where user_id = p_user_id)
       or exists (select 1 from leaderboard.user_access where user_id = p_user_id and role <> 'staff') then
      raise exception 'الحساب ده مش حساب «إداري» — تعديله للمسؤول الكامل' using errcode = '42501';
    end if;
    select permissions into v_mine from leaderboard.user_access where user_id = auth.uid();
    if exists (select 1 from unnest(coalesce(p_permissions, '{}')) p where p <> all (coalesce(v_mine, '{}'))
               or p = 'staff_accounts') then
      raise exception 'تقدر تدي الإداري من الأقسام اللي معاك انت بس' using errcode = '42501';
    end if;
  end if;

  if p_user_id = auth.uid() then
    raise exception 'لا يمكنك تغيير صلاحياتك بنفسك — اطلب ذلك من مسؤول آخر' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'editor', 'readonly', 'viewer', 'staff', 'staff_manager') then
    raise exception 'دور غير معروف: %', p_role using errcode = '22023';
  end if;

  select lower(email) into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'المستخدم غير موجود' using errcode = 'P0002';
  end if;
  if exists (select 1 from leaderboard.demo_accounts where email = v_email) then
    raise exception 'حساب العرض للاطلاع فقط دائماً — صلاحياته لا تتغيّر' using errcode = '42501';
  end if;

  -- «إدارة حسابات الإداريين» للمدير الإداري بس
  v_allowed := public.lb_permission_keys()
    || case when p_role = 'staff_manager' then array['staff_accounts'] else '{}'::text[] end;
  if exists (select 1 from unnest(coalesce(p_permissions, '{}')) p where p <> all (v_allowed)) then
    raise exception 'صلاحية غير معروفة لهذا الدور' using errcode = '22023';
  end if;
  select coalesce(array_agg(k order by ord), '{}') into v_perms
  from unnest(v_allowed) with ordinality as t (k, ord)
  where k = any (coalesce(p_permissions, '{}'));

  if p_role = any (public.lb_section_roles()) and cardinality(v_perms) = 0 then
    raise exception 'اختر قسماً واحداً على الأقل' using errcode = '22023';
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
      values (p_user_id, p_role,
              case when p_role = any (public.lb_section_roles()) then v_perms else '{}' end,
              now(), auth.uid())
      on conflict (user_id) do update
        set role = excluded.role, permissions = excluded.permissions,
            updated_at = now(), updated_by = auth.uid();
    end if;
  end if;

  insert into leaderboard.maintenance_log (kind, details)
  values ('access', jsonb_build_object('user', v_email, 'role', p_role, 'permissions', to_jsonb(v_perms)));
end $fn$;

create or replace function public.lb_admin_set_username(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_name text := lower(trim(coalesce(p_username, '')));
begin
  if not public.lb_can_manage_user(p_user_id) then
    perform public.lb_require('users');
    raise exception 'تقدر تدير حسابات «إداري» بس' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'المستخدم غير موجود' using errcode = 'P0002';
  end if;

  if v_name = '' then
    if exists (select 1 from auth.users where id = p_user_id
               and email like '%@noemail.everest-leaderboard.app') then
      raise exception 'هذا الحساب بلا بريد — اسم المستخدم مطلوب للدخول' using errcode = '22023';
    end if;
    delete from leaderboard.usernames where user_id = p_user_id;
    return;
  end if;

  if v_name !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'اسم المستخدم من 3 إلى 30 حرفاً: حروف إنجليزية صغيرة وأرقام و . _ - ويبدأ بحرف أو رقم'
      using errcode = '22023';
  end if;
  if exists (select 1 from leaderboard.usernames where username = v_name and user_id <> p_user_id) then
    raise exception 'اسم المستخدم «%» مستخدم بالفعل', v_name using errcode = '23505';
  end if;

  insert into leaderboard.usernames (user_id, username)
  values (p_user_id, v_name)
  on conflict (user_id) do update
    set username = excluded.username, failed_count = 0, locked_until = null, updated_at = now();
end $fn$;

create or replace function public.lb_admin_log_user_action(p_action text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  if not public.lb_can_manage_user(p_user_id) then
    perform public.lb_require('users');
    raise exception 'تقدر تدير حسابات «إداري» بس' using errcode = '42501';
  end if;
  if p_action not in ('user_create', 'user_email', 'user_password', 'user_ban', 'user_unban', 'user_delete') then
    raise exception 'إجراء غير معروف' using errcode = '22023';
  end if;
  insert into leaderboard.audit_log (user_id, actor, action, entity, label)
  values (auth.uid(), leaderboard.audit_user_label(auth.uid()), p_action, 'users',
          leaderboard.audit_user_label(p_user_id));
end $fn$;
