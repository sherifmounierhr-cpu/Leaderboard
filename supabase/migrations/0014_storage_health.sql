-- ==================================================================
-- مؤشر المساحة، سجل الصيانة، وإخلاء المساحة.
--
-- الحدود هنا حدود خطة Supabase المجانية (قاعدة 500MB، ملفات 1GB). لو
-- اترقّت الخطة تتعدّل الأرقام في lb_storage_usage فقط.
-- ==================================================================

-- --------------------------------------------------- سجل الصيانة
create table if not exists leaderboard.maintenance_log (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('backup', 'cleanup')),
  details     jsonb not null default '{}'::jsonb,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table leaderboard.maintenance_log enable row level security;

-- ------------------------------------------------ قراءة الاستهلاك
-- للقراءة فقط، فحساب العرض يشوفها زي المسؤول.
create or replace function public.lb_storage_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = leaderboard, public
as $$
declare
  result jsonb;
begin
  if not (public.is_admin() or public.lb_is_demo()) then
    raise exception 'مسموح للمسؤولين فقط' using errcode = '42501';
  end if;

  with objects as (
    select o.name, coalesce((o.metadata ->> 'size')::bigint, 0) as bytes, o.created_at,
           -- صورة غير مستخدمة: لا فريق ولا مستشار يشير لها، وعمرها أكثر من يوم
           -- (حتى لا تُعدّ صورة رُفعت للتو قبل حفظ النموذج)
           not exists (select 1 from leaderboard.agents a where a.photo_url like '%/avatars/' || o.name)
           and not exists (select 1 from leaderboard.teams t where t.photo_url like '%/avatars/' || o.name)
           and o.created_at < now() - interval '1 day' as orphan
    from storage.objects o
    where o.bucket_id = 'avatars'
  )
  select jsonb_build_object(
    'checked_at', now(),
    'db', jsonb_build_object(
      'used',  pg_database_size(current_database()),
      'limit', 500 * 1024 * 1024
    ),
    'files', jsonb_build_object(
      'used',  (select coalesce(sum(bytes), 0) from objects),
      'count', (select count(*) from objects),
      'limit', 1024 * 1024 * 1024,
      'orphan_count', (select count(*) from objects where orphan),
      'orphan_bytes', (select coalesce(sum(bytes), 0) from objects where orphan),
      'orphan_paths', (select coalesce(jsonb_agg(name), '[]'::jsonb) from objects where orphan)
    ),
    'tables', jsonb_build_array(
      jsonb_build_object('key', 'sale_events',
        'rows', (select count(*) from leaderboard.sale_events),
        'bytes', pg_total_relation_size('leaderboard.sale_events'),
        'oldest', (select min(created_at) from leaderboard.sale_events)),
      jsonb_build_object('key', 'snapshots',
        'rows', (select count(*) from leaderboard.snapshots),
        'bytes', pg_total_relation_size('leaderboard.snapshots'),
        'oldest', (select min(taken_on) from leaderboard.snapshots)),
      jsonb_build_object('key', 'sync_log',
        'rows', (select count(*) from leaderboard.sync_log),
        'bytes', pg_total_relation_size('leaderboard.sync_log'),
        'oldest', (select min(ran_at) from leaderboard.sync_log)),
      jsonb_build_object('key', 'sales',
        'rows', (select count(*) from leaderboard.sales) + (select count(*) from leaderboard.targets),
        'bytes', pg_total_relation_size('leaderboard.sales') + pg_total_relation_size('leaderboard.targets'),
        'oldest', null)
    ),
    'last_backup',  (select max(created_at) from leaderboard.maintenance_log where kind = 'backup'),
    'last_cleanup', (select max(created_at) from leaderboard.maintenance_log where kind = 'cleanup')
  ) into result;

  return result;
end $$;

revoke all on function public.lb_storage_usage() from public, anon;
grant execute on function public.lb_storage_usage() to authenticated;

-- ------------------------------------------- تسجيل نسخة احتياطية
create or replace function public.lb_admin_log_backup(p_details jsonb)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  insert into leaderboard.maintenance_log (kind, details) values ('backup', coalesce(p_details, '{}'::jsonb));
end $$;

revoke all on function public.lb_admin_log_backup(jsonb) from public, anon;
grant execute on function public.lb_admin_log_backup(jsonb) to authenticated;

-- ------------------------------------------------- إخلاء المساحة
-- كل معامل null = تخطّي هذا النوع. حدود أمان على الخادم نفسه:
--   * الإشعارات: أقدم من 30 يوماً على الأقل
--   * اللقطات اليومية: قبل بداية الربع الحالي فقط (رسم الربع الجاري يفضل سليم)
--   * سجل المزامنة: أقدم من 7 أيام على الأقل
-- المبيعات والأهداف والفرق والمستشارون لا تُمسّ أبداً.
create or replace function public.lb_admin_cleanup(
  p_events_before    timestamptz,
  p_snapshots_before date,
  p_sync_log_before  timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $$
declare
  quarter_start date := date_trunc('quarter', now() at time zone 'Africa/Cairo')::date;
  n_events    integer := 0;
  n_snapshots integer := 0;
  n_sync      integer := 0;
  result      jsonb;
begin
  perform public.lb_admin_guard();

  if p_events_before is not null then
    if p_events_before > now() - interval '30 days' then
      raise exception 'لا يمكن حذف إشعارات أحدث من 30 يوماً' using errcode = '22023';
    end if;
    delete from leaderboard.sale_events where created_at < p_events_before;
    get diagnostics n_events = row_count;
  end if;

  if p_snapshots_before is not null then
    if p_snapshots_before > quarter_start then
      raise exception 'لقطات الربع الحالي لازمة للرسم البياني ولا تُحذف' using errcode = '22023';
    end if;
    delete from leaderboard.snapshots where taken_on < p_snapshots_before;
    get diagnostics n_snapshots = row_count;
  end if;

  if p_sync_log_before is not null then
    if p_sync_log_before > now() - interval '7 days' then
      raise exception 'لا يمكن حذف سجل مزامنة أحدث من 7 أيام' using errcode = '22023';
    end if;
    delete from leaderboard.sync_log where ran_at < p_sync_log_before;
    get diagnostics n_sync = row_count;
  end if;

  result := jsonb_build_object('events', n_events, 'snapshots', n_snapshots, 'sync_log', n_sync);
  insert into leaderboard.maintenance_log (kind, details) values ('cleanup', result);
  return result;
end $$;

revoke all on function public.lb_admin_cleanup(timestamptz, date, timestamptz) from public, anon;
grant execute on function public.lb_admin_cleanup(timestamptz, date, timestamptz) to authenticated;
