/*
 * إعادة عرض احتفال على كل الشاشات.
 *
 * زرار الاحتفال في قائمة الإشعارات كان بيعيد العرض على نفس الجهاز بس، فاللي
 * بيضغطه من موبايله ما بيشوفش حاجة على شاشة المكتب. دلوقتي اللي معاه صلاحية
 * «احتفال» بيسجّل طلب هنا، والشاشات كلها بتسمعه لحظياً وتعرض نفس الحدث.
 *
 * الطلب بيشاور على الحدث الأصلي بدل ما ينسخه: مفيش صف جديد في sale_events،
 * فقائمة الإشعارات والأرقام ما بتتأثرش.
 */
create table if not exists leaderboard.event_replays (
  id         bigint generated always as identity primary key,
  event_id   bigint not null references leaderboard.sale_events (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists event_replays_created_idx on leaderboard.event_replays (created_at desc);

alter table leaderboard.event_replays enable row level security;
drop policy if exists lb_read_all on leaderboard.event_replays;
create policy lb_read_all on leaderboard.event_replays for select to authenticated using (true);
revoke all on leaderboard.event_replays from anon;
grant select on leaderboard.event_replays to authenticated;

create or replace view public.lb_event_replays with (security_invoker = true) as
select id, event_id, created_at
from leaderboard.event_replays
order by id desc
limit 20;

revoke all on public.lb_event_replays from anon;
grant select on public.lb_event_replays to authenticated;

create or replace function public.lb_admin_replay_event(p_event_id bigint)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_require('celebrate');
  if not exists (select 1 from leaderboard.sale_events where id = p_event_id) then
    raise exception 'الإشعار غير موجود' using errcode = '22023';
  end if;
  insert into leaderboard.event_replays (event_id, created_by) values (p_event_id, auth.uid());
  -- السجل ما يكبرش: الشاشات بتقرا الأحدث بس
  delete from leaderboard.event_replays
   where id not in (select id from leaderboard.event_replays order by id desc limit 50);
end $$;

revoke all on function public.lb_admin_replay_event(bigint) from public, anon;
grant execute on function public.lb_admin_replay_event(bigint) to authenticated;

-- الشاشات بتسمع الطلب لحظياً
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = 'event_replays'
     ) then
    alter publication supabase_realtime add table leaderboard.event_replays;
  end if;
end $$;
