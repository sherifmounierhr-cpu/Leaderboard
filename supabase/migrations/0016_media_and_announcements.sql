-- ==================================================================
-- صوتيات الاحتفال، إعدادات العرض، ورسائل الترحيب/التحفيز المجدولة.
--
-- الجدولة نفسها بتتحسب على الشاشات (كل شاشة تعرف قائمة الرسائل ومواعيدها)،
-- فمفيش cron: القاعدة هنا بتخزّن وتتحقق من القيم بس.
-- ==================================================================

-- ------------------------------------------------------------ مخزن الصوت
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 15 * 1024 * 1024,
        array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
              'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  cond text := 'bucket_id = ''media'' and public.is_admin() and not public.lb_is_demo()';
begin
  execute 'drop policy if exists lb_media_read on storage.objects';
  execute 'create policy lb_media_read on storage.objects for select to anon, authenticated using (bucket_id = ''media'')';
  execute 'drop policy if exists lb_media_insert on storage.objects';
  execute format('create policy lb_media_insert on storage.objects for insert to authenticated with check (%s)', cond);
  execute 'drop policy if exists lb_media_update on storage.objects';
  execute format('create policy lb_media_update on storage.objects for update to authenticated using (%s) with check (%s)', cond, cond);
  execute 'drop policy if exists lb_media_delete on storage.objects';
  execute format('create policy lb_media_delete on storage.objects for delete to authenticated using (%s)', cond);
end $$;

-- ------------------------------------------------------------ مكتبة الصوت
create table if not exists leaderboard.media_files (
  id          uuid primary key default gen_random_uuid(),
  -- song: أغنية احتفال · clip: مقطع قصير للرسائل
  kind        text not null check (kind in ('song', 'clip')),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  path        text not null unique check (path ~ '^(songs|clips)/[A-Za-z0-9._-]+$'),
  duration_s  numeric(8, 2) check (duration_s is null or duration_s >= 0),
  size_bytes  bigint not null default 0,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ إعدادات العرض
create table if not exists leaderboard.board_settings (
  id                   smallint primary key default 1 check (id = 1),
  celebration_seconds  smallint not null default 8 check (celebration_seconds between 3 and 120),
  celebration_song_id  uuid references leaderboard.media_files (id) on delete set null,
  volume               smallint not null default 80 check (volume between 0 and 100),
  updated_at           timestamptz not null default now()
);
insert into leaderboard.board_settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------ اختيارات الاحتفال اليدوي
alter table leaderboard.sale_events
  add column if not exists song_id    uuid references leaderboard.media_files (id) on delete set null,
  add column if not exists mute       boolean not null default false,
  add column if not exists duration_s smallint check (duration_s is null or duration_s between 3 and 120);

-- ------------------------------------------------------------ الرسائل
create table if not exists leaderboard.announcements (
  id          uuid primary key default gen_random_uuid(),
  style       text not null check (style in ('welcome', 'motivation')),
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  body        text check (body is null or char_length(body) <= 280),
  duration_s  smallint not null default 15 check (duration_s between 5 and 300),
  clip_id     uuid references leaderboard.media_files (id) on delete set null,
  -- once: مرة في starts_at («الآن» = وقت الحفظ) · daily: كل يوم مختار في daily_time بتوقيت القاهرة
  schedule    text not null check (schedule in ('once', 'daily')),
  starts_at   timestamptz,
  daily_time  time,
  weekdays    smallint[] not null default '{}',
  active      boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (schedule <> 'once' or starts_at is not null),
  check (schedule <> 'daily' or (daily_time is not null and cardinality(weekdays) > 0
         and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]))
);

-- ------------------------------------------------------------ RLS والصلاحيات
do $$
declare t text;
begin
  foreach t in array array['media_files', 'board_settings', 'announcements'] loop
    execute format('alter table leaderboard.%I enable row level security', t);
    execute format('drop policy if exists lb_read_all on leaderboard.%I', t);
    execute format('create policy lb_read_all on leaderboard.%I for select to authenticated using (true)', t);
    execute format('revoke all on leaderboard.%I from anon', t);
    execute format('grant select on leaderboard.%I to authenticated', t);
  end loop;
end $$;

-- ------------------------------------------------------------ القراءة
create or replace view public.lb_media_files with (security_invoker = true) as
select id, kind, name, path, duration_s, size_bytes, created_at
from leaderboard.media_files;

create or replace view public.lb_board_settings with (security_invoker = true) as
select celebration_seconds, celebration_song_id, volume, updated_at
from leaderboard.board_settings where id = 1;

create or replace view public.lb_announcements with (security_invoker = true) as
select id, style, title, body, duration_s, clip_id, schedule, starts_at,
       to_char(daily_time, 'HH24:MI') as daily_time, weekdays, active, created_at, updated_at
from leaderboard.announcements;

-- أعمدة جديدة في آخر القائمة: create or replace view لا يقبل الإدراج في الوسط
create or replace view public.lb_sale_events with (security_invoker = true) as
select
  e.id, e.agent_id, e.year, e.quarter, e.kind, e.amount_egp, e.total_egp, e.note, e.created_at,
  a.name, a.name_ar, a.photo_url,
  t.name as team, t.name_ar as team_ar,
  e.song_id, e.mute, e.duration_s
from leaderboard.sale_events e
join leaderboard.agents a on a.id = e.agent_id
left join leaderboard.teams t on t.id = a.team_id;

revoke all on public.lb_media_files, public.lb_board_settings, public.lb_announcements, public.lb_sale_events from anon;
grant select on public.lb_media_files, public.lb_board_settings, public.lb_announcements, public.lb_sale_events to authenticated;

-- ------------------------------------------------------------ الكتابة (محروسة)
create or replace function public.lb_admin_save_board_settings(p_seconds smallint, p_song_id uuid, p_volume smallint)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  if p_song_id is not null and not exists (select 1 from leaderboard.media_files where id = p_song_id) then
    raise exception 'الأغنية غير موجودة' using errcode = '22023';
  end if;
  update leaderboard.board_settings
     set celebration_seconds = p_seconds, celebration_song_id = p_song_id,
         volume = p_volume, updated_at = now()
   where id = 1;
end $$;

create or replace function public.lb_admin_register_media(
  p_kind text, p_name text, p_path text, p_duration numeric, p_size bigint
)
returns uuid
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_id uuid;
begin
  perform public.lb_admin_guard();
  insert into leaderboard.media_files (kind, name, path, duration_s, size_bytes, created_by)
  values (p_kind, btrim(p_name), p_path, p_duration, coalesce(p_size, 0), auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- يرجّع مسار الملف: الواجهة تمسحه من المخزن بعد حذف السجل
create or replace function public.lb_admin_delete_media(p_id uuid)
returns text
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_path text;
begin
  perform public.lb_admin_guard();
  delete from leaderboard.media_files where id = p_id returning path into v_path;
  return v_path;
end $$;

create or replace function public.lb_admin_save_announcement(
  p_id uuid, p_style text, p_title text, p_body text, p_duration smallint, p_clip_id uuid,
  p_schedule text, p_starts_at timestamptz, p_daily_time text, p_weekdays smallint[], p_active boolean
)
returns uuid
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_id uuid;
begin
  perform public.lb_admin_guard();
  if p_id is null then
    insert into leaderboard.announcements
      (style, title, body, duration_s, clip_id, schedule, starts_at, daily_time, weekdays, active, created_by)
    values
      (p_style, btrim(p_title), nullif(btrim(p_body), ''), p_duration, p_clip_id, p_schedule,
       case when p_schedule = 'once' then coalesce(p_starts_at, now()) end,
       case when p_schedule = 'daily' then p_daily_time::time end,
       case when p_schedule = 'daily' then coalesce(p_weekdays, '{}') else '{}' end,
       coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update leaderboard.announcements set
      style = p_style, title = btrim(p_title), body = nullif(btrim(p_body), ''),
      duration_s = p_duration, clip_id = p_clip_id, schedule = p_schedule,
      starts_at  = case when p_schedule = 'once' then coalesce(p_starts_at, now()) end,
      daily_time = case when p_schedule = 'daily' then p_daily_time::time end,
      weekdays   = case when p_schedule = 'daily' then coalesce(p_weekdays, '{}') else '{}' end,
      active = coalesce(p_active, true), updated_at = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'الرسالة غير موجودة' using errcode = '22023';
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.lb_admin_delete_announcement(p_id uuid)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  delete from leaderboard.announcements where id = p_id;
end $$;

-- الاحتفال اليدوي: أغنية مختارة أو بدون صوت، ومدة خاصة اختيارية
drop function if exists public.lb_admin_celebrate(uuid, text);
create or replace function public.lb_admin_celebrate(
  p_agent_id uuid, p_note text default null,
  p_song_id uuid default null, p_mute boolean default false, p_seconds smallint default null
)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
declare
  v_now   timestamp := now() at time zone 'Africa/Cairo';
  v_year  smallint  := extract(year from v_now);
  v_q     smallint  := extract(quarter from v_now);
  v_note  text      := nullif(btrim(p_note), '');
  v_total numeric;
begin
  perform public.lb_admin_guard();
  if not exists (select 1 from leaderboard.agents where id = p_agent_id) then
    raise exception 'المستشار غير موجود' using errcode = '22023';
  end if;
  if char_length(v_note) > 140 then
    raise exception 'الرسالة أطول من 140 حرفاً' using errcode = '22023';
  end if;
  select sum(amount_egp) into v_total from leaderboard.sales
  where agent_id = p_agent_id and year = v_year and quarter = v_q;
  insert into leaderboard.sale_events (agent_id, year, quarter, kind, total_egp, note, created_by, song_id, mute, duration_s)
  values (p_agent_id, v_year, v_q, 'manual', coalesce(v_total, 0), v_note, auth.uid(),
          p_song_id, coalesce(p_mute, false), p_seconds);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lb_admin_save_board_settings(smallint, uuid, smallint)',
    'public.lb_admin_register_media(text, text, text, numeric, bigint)',
    'public.lb_admin_delete_media(uuid)',
    'public.lb_admin_save_announcement(uuid, text, text, text, smallint, uuid, text, timestamptz, text, smallint[], boolean)',
    'public.lb_admin_delete_announcement(uuid)',
    'public.lb_admin_celebrate(uuid, text, uuid, boolean, smallint)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ------------------------------------------------------------ Realtime
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['media_files', 'board_settings', 'announcements'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table leaderboard.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ------------------------------------------------------------ مؤشر المساحة
-- الصوت يتحسب مع الصور، والملف اللي مالوش سجل في media_files يتعد غير مستخدم
create or replace function public.lb_storage_usage()
returns jsonb
language plpgsql stable security definer set search_path = leaderboard, public
as $$
declare result jsonb;
begin
  if not (public.is_admin() or public.lb_is_demo()) then
    raise exception 'مسموح للمسؤولين فقط' using errcode = '42501';
  end if;

  with objects as (
    select o.bucket_id, o.name, coalesce((o.metadata ->> 'size')::bigint, 0) as bytes,
           o.created_at < now() - interval '1 day'
           and case o.bucket_id
             when 'avatars' then
               not exists (select 1 from leaderboard.agents a where a.photo_url like '%/avatars/' || o.name)
               and not exists (select 1 from leaderboard.teams t where t.photo_url like '%/avatars/' || o.name)
             else not exists (select 1 from leaderboard.media_files m where m.path = o.name)
           end as orphan
    from storage.objects o
    where o.bucket_id in ('avatars', 'media')
  )
  select jsonb_build_object(
    'checked_at', now(),
    'db', jsonb_build_object('used', pg_database_size(current_database()), 'limit', 500 * 1024 * 1024),
    'files', jsonb_build_object(
      'used',  (select coalesce(sum(bytes), 0) from objects),
      'count', (select count(*) from objects),
      'limit', 1024 * 1024 * 1024,
      'audio_bytes', (select coalesce(sum(bytes), 0) from objects where bucket_id = 'media'),
      'orphan_count', (select count(*) from objects where orphan),
      'orphan_bytes', (select coalesce(sum(bytes), 0) from objects where orphan),
      'orphan_paths', (select coalesce(jsonb_agg(name), '[]'::jsonb) from objects where orphan and bucket_id = 'avatars'),
      'orphan_media_paths', (select coalesce(jsonb_agg(name), '[]'::jsonb) from objects where orphan and bucket_id = 'media')
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
