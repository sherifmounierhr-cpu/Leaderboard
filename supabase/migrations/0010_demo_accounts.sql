-- حسابات العرض: للمقيّمين والعروض التقديمية.
--
-- حساب العرض يرى صفحة الإدارة كاملة (القراءة ممنوحة لكل مسجَّل أصلاً)، لكن
-- الحارس يرفض أي كتابة منه قبل فحص الدور — فحتى لو رُقّي دوره بالخطأ إلى
-- admin يبقى للاطلاع فقط. رفع الصور محروس بـ is_admin() فهو مرفوض أيضاً.
--
-- المطابقة بالبريد لا بالمعرّف: الحساب يُنشأ من لوحة Supabase بعد هذا الملف،
-- فمعرّفه غير معروف وقت كتابته.

create table if not exists leaderboard.demo_accounts (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table leaderboard.demo_accounts enable row level security;
revoke all on leaderboard.demo_accounts from anon, authenticated;

insert into leaderboard.demo_accounts (email)
values ('demo@everest-leaderboard.app')
on conflict do nothing;

create or replace function public.lb_is_demo()
returns boolean
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select exists (
    select 1 from leaderboard.demo_accounts
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$fn$;

revoke all on function public.lb_is_demo() from public, anon;
grant execute on function public.lb_is_demo() to authenticated;

-- الحارس المشترك لكل دوال الكتابة: فحص العرض أولاً
create or replace function public.lb_admin_guard()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.lb_is_demo() then
    raise exception 'حساب عرض — للاطلاع فقط، التعديل غير متاح' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'مسموح للمسؤولين فقط' using errcode = '42501';
  end if;
end $fn$;

revoke execute on function public.lb_admin_guard() from anon, authenticated, public;

-- رفع الصور: نفس القاعدة على مستوى سياسات التخزين
do $$
declare
  cond text := 'bucket_id = ''avatars'' and public.is_admin() and not public.lb_is_demo()';
begin
  execute 'drop policy if exists lb_avatars_insert on storage.objects';
  execute format('create policy lb_avatars_insert on storage.objects for insert to authenticated with check (%s)', cond);
  execute 'drop policy if exists lb_avatars_update on storage.objects';
  execute format('create policy lb_avatars_update on storage.objects for update to authenticated using (%s) with check (%s)', cond, cond);
  execute 'drop policy if exists lb_avatars_delete on storage.objects';
  execute format('create policy lb_avatars_delete on storage.objects for delete to authenticated using (%s)', cond);
end $$;
