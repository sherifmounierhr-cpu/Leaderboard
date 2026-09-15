-- صلاحيات اللوحة المستقلة.
--
-- اللوحة كانت تعيش على نفس مشروع تطبيق الموارد البشرية وتستعير منه
-- public.profiles و public.is_admin(). بعد فصلها إلى مشروع خاص صار لها
-- جدول مسؤولين خاص، ولا تعتمد على أي جدول خارج schema leaderboard.
--
-- يُطبَّق قبل 0001 لأن سياسات التخزين في 0004 تستدعي is_admin() لحظة إنشائها.

create schema if not exists leaderboard;

-- بالمعرّف لا بالبريد: تغيير البريد لا يمنح ولا يسحب الصلاحية
create table if not exists leaderboard.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table leaderboard.admins enable row level security;
revoke all on leaderboard.admins from anon, authenticated;

-- المسؤول الأول، إن كان حسابه موجوداً وقت التطبيق
insert into leaderboard.admins (user_id)
select id from auth.users where lower(email) = 'sherifmounierhr@gmail.com'
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = leaderboard, public
as $fn$
  select exists (select 1 from leaderboard.admins where user_id = auth.uid());
$fn$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
