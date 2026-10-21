-- صورة لكل حساب في لوحة الإدارة (المسؤولين، المديرين الإداريين، الإداريين…).
--
-- بتظهر في قائمة المستخدمين وجنب اسم الشخص فوق في صفحة الإدارة. اللي يقدر
-- يغيّرها: اللي يقدر يدير الحساب نفسه (lb_can_manage_user — المسؤول لأي حساب،
-- والمدير الإداري لحسابات «إداري»)، وصاحب الحساب لصورته هو.
-- الملفات في avatars/users/ وما بتتقبلش روابط من برّه المخزن.

create table if not exists leaderboard.user_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  photo_url  text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table leaderboard.user_profiles enable row level security;
revoke all on leaderboard.user_profiles from anon, authenticated;

create or replace function public.lb_admin_set_user_photo(p_user_id uuid, p_photo_url text)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_url text := nullif(trim(coalesce(p_photo_url, '')), '');
begin
  if public.lb_is_demo() then
    raise exception 'حساب عرض — للاطلاع فقط، التعديل غير متاح' using errcode = '42501';
  end if;
  if p_user_id is distinct from auth.uid() and not public.lb_can_manage_user(p_user_id) then
    raise exception 'ليس لديك صلاحية تغيير صورة هذا الحساب' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'المستخدم غير موجود' using errcode = 'P0002';
  end if;
  if v_url is not null and v_url !~ '^https://[^/]+/storage/v1/object/public/avatars/users/[^/]+$' then
    raise exception 'رابط الصورة غير صالح' using errcode = '22023';
  end if;

  insert into leaderboard.user_profiles (user_id, photo_url, updated_at, updated_by)
  values (p_user_id, v_url, now(), auth.uid())
  on conflict (user_id) do update
    set photo_url = excluded.photo_url, updated_at = now(), updated_by = auth.uid();
end $fn$;

revoke all on function public.lb_admin_set_user_photo(uuid, text) from public, anon;
grant execute on function public.lb_admin_set_user_photo(uuid, text) to authenticated;

-- الرفع في avatars/users/: المسؤول، والمدير الإداري بصلاحية الحسابات، وأي حساب
-- معاه أقسام (لصورته هو — الربط نفسه محروس في lb_admin_set_user_photo)
drop policy if exists lb_avatars_users_insert on storage.objects;
create policy lb_avatars_users_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'users' and public.lb_can_view_admin()
              and not public.lb_is_demo());
drop policy if exists lb_avatars_users_update on storage.objects;
create policy lb_avatars_users_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'users' and public.lb_can_view_admin()
         and not public.lb_is_demo())
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'users' and public.lb_can_view_admin()
              and not public.lb_is_demo());

-- صورتي في lb_my_access (للشريط اللي فوق)
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
    end),
    'photo_url', (select photo_url from leaderboard.user_profiles where user_id = auth.uid()),
    'username', (select username from leaderboard.usernames where user_id = auth.uid())
  );
$fn$;

-- القائمة بالصورة (تغيير شكل الناتج = drop ثم create)
drop function if exists public.lb_admin_list_users();
create function public.lb_admin_list_users()
returns table(id uuid, email text, username text, role text, permissions text[],
              created_at timestamptz, last_sign_in_at timestamptz, banned boolean, photo_url text)
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
    coalesce(u.banned_until > now(), false),
    p.photo_url
  from auth.users u
  left join leaderboard.admins a        on a.user_id = u.id
  left join leaderboard.demo_accounts d on d.email = lower(u.email)
  left join leaderboard.user_access x   on x.user_id = u.id
  left join leaderboard.usernames n     on n.user_id = u.id
  left join leaderboard.user_profiles p on p.user_id = u.id
  where v_all or (x.role = 'staff' and a.user_id is null and d.email is null)
  order by u.created_at;
end $fn$;

revoke all on function public.lb_admin_list_users() from public, anon;
grant execute on function public.lb_admin_list_users() to authenticated;
