-- الدخول باسم مستخدم أو بالبريد.
--
-- Supabase Auth يدخل بالبريد فقط، فالاسم يُترجَم إلى بريد داخل دالة الحافة
-- username-sign-in بمفتاح الخدمة — لا يوجد أي استدعاء متاح للمتصفح يكشف بريد
-- صاحب اسم، فلا تسريب للبريد ولا تخمين للأسماء (نفس رسالة الخطأ في الحالتين).
--
-- الحساب قد يكون بلا بريد حقيقي: دالة admin-users تعطيه بريداً داخلياً
-- <الاسم>@noemail.everest-leaderboard.app لا يستقبل رسائل.
--
-- حماية التخمين: كل دخول بالاسم يمر من نفس عنوان الدالة، فحدّ Supabase لكل
-- عنوان لا يكفي. 5 محاولات خاطئة متتالية تقفل الاسم 15 دقيقة.

create table if not exists leaderboard.usernames (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique
                check (username ~ '^[a-z0-9][a-z0-9._-]{2,29}$'),
  failed_count  smallint not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table leaderboard.usernames enable row level security;
revoke all on leaderboard.usernames from anon, authenticated;

-- ------------------------------------------------ تحديد الاسم (مسؤول كامل)
create or replace function public.lb_admin_set_username(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_name text := lower(trim(coalesce(p_username, '')));
begin
  perform public.lb_require('users');

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'المستخدم غير موجود' using errcode = 'P0002';
  end if;

  if v_name = '' then
    -- حساب بلا بريد حقيقي لا يُترك بلا اسم: لن يستطيع الدخول أصلاً
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

revoke all on function public.lb_admin_set_username(uuid, text) from public, anon;
grant execute on function public.lb_admin_set_username(uuid, text) to authenticated;

-- ------------------------------------- للدالة username-sign-in فقط (service_role)
-- يرجّع البريد، أو null لو الاسم غير موجود / مقفول / الحساب موقوف
create or replace function public.lb_svc_login_lookup(p_username text)
returns text
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select u.email::text
  from leaderboard.usernames n
  join auth.users u on u.id = n.user_id
  where n.username = lower(trim(p_username))
    and (n.locked_until is null or n.locked_until < now());
$fn$;

create or replace function public.lb_svc_login_result(p_username text, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  if p_ok then
    update leaderboard.usernames
    set failed_count = 0, locked_until = null
    where username = lower(trim(p_username));
  else
    update leaderboard.usernames
    set failed_count = case when failed_count + 1 >= 5 then 0 else failed_count + 1 end,
        locked_until = case when failed_count + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where username = lower(trim(p_username));
  end if;
end $fn$;

revoke all on function public.lb_svc_login_lookup(text) from public, anon, authenticated;
revoke all on function public.lb_svc_login_result(text, boolean) from public, anon, authenticated;
grant execute on function public.lb_svc_login_lookup(text) to service_role;
grant execute on function public.lb_svc_login_result(text, boolean) to service_role;

-- ------------------------------------------------ قائمة المستخدمين + الاسم
drop function if exists public.lb_admin_list_users();
create function public.lb_admin_list_users()
returns table (
  id              uuid,
  email           text,
  username        text,
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
    -- البريد الداخلي لا يُعرض كأنه بريد حقيقي
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
  order by u.created_at;
end $fn$;

revoke all on function public.lb_admin_list_users() from public, anon;
grant execute on function public.lb_admin_list_users() to authenticated;
