-- ---------------------------------------------------------------------------
-- 0020 — التحكم في شاشة الأخبار من صفحة الإدارة.
--
-- كل حاجة كانت ثابتة في الكود (مدة الخبر، عدد الإعادات، النغمة) بقت إعداد
-- مشترك: الشاشات بتقراه من نفس الصف، فأي تعديل بيوصلهم كلهم من غير نشر.
--
-- وكمان: إخفاء خبر بعينه من كل الشاشات، وبثّ خبر فوراً على كل الشاشات.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------- إعدادات الأخبار
alter table leaderboard.board_settings
  add column if not exists news_enabled    boolean  not null default true,
  add column if not exists news_slide_s    smallint not null default 9  check (news_slide_s between 4 and 60),
  add column if not exists news_repeats    smallint not null default 3  check (news_repeats between 1 and 10),
  add column if not exists news_gap_min    smallint not null default 5  check (news_gap_min between 1 and 120),
  add column if not exists news_chime      boolean  not null default true,
  add column if not exists news_volume     smallint not null default 70 check (news_volume between 0 and 100),
  -- null = النغمة المدمجة المولّدة في المتصفح، مش ملف
  add column if not exists news_sound_id   uuid references leaderboard.media_files (id) on delete set null;

-- الأعمدة الجديدة تتضاف في الآخر: create or replace مش بيسمح بإعادة ترتيب أعمدة view
create or replace view public.lb_board_settings with (security_invoker = true) as
select celebration_seconds, celebration_song_id, volume, updated_at,
       cbe_deposit, cbe_lending, cbe_rates_at,
       news_enabled, news_slide_s, news_repeats, news_gap_min,
       news_chime, news_volume, news_sound_id
from leaderboard.board_settings where id = 1;

create or replace function public.lb_admin_save_news_settings(
  p_enabled boolean, p_slide_s smallint, p_repeats smallint, p_gap_min smallint,
  p_chime boolean, p_volume smallint, p_sound_id uuid
)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  if p_sound_id is not null and not exists (select 1 from leaderboard.media_files where id = p_sound_id) then
    raise exception 'الصوت غير موجود' using errcode = '22023';
  end if;
  update leaderboard.board_settings
     set news_enabled = coalesce(p_enabled, news_enabled),
         news_slide_s = coalesce(p_slide_s, news_slide_s),
         news_repeats = coalesce(p_repeats, news_repeats),
         news_gap_min = coalesce(p_gap_min, news_gap_min),
         news_chime   = coalesce(p_chime, news_chime),
         news_volume  = coalesce(p_volume, news_volume),
         news_sound_id = p_sound_id,
         updated_at = now()
   where id = 1;
end $$;

-- --------------------------------------------------------- أخبار مخفيّة
/*
 * الأخبار مش مخزّنة عندنا — بتتجاب من المدونة كل مرة. فالإخفاء بيتسجّل
 * بمعرّف المقال في ووردبريس، والشاشة بتشيله من القائمة وهي بتعرض.
 */
create table if not exists leaderboard.news_hidden (
  post_id   bigint primary key,
  title     text,
  hidden_at timestamptz not null default now(),
  hidden_by uuid default auth.uid()
);

-- --------------------------------------------------------- بثّ خبر فوراً
/*
 * بنخزّن نص الخبر وصورته وقت البث، مش المعرّف بس: الخبر ممكن يكون خرج من
 * آخر عشرة على المدونة وقتها الشاشة مش هتلاقيه.
 */
create table if not exists leaderboard.news_casts (
  id         uuid primary key default gen_random_uuid(),
  post_id    bigint not null,
  title      text not null check (length(title) between 1 and 300),
  excerpt    text,
  image      text,
  url        text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists news_casts_created_idx on leaderboard.news_casts (created_at desc);

-- ------------------------------------------------------------ RLS والصلاحيات
do $$
declare t text;
begin
  foreach t in array array['news_hidden', 'news_casts'] loop
    execute format('alter table leaderboard.%I enable row level security', t);
    execute format('drop policy if exists lb_read_all on leaderboard.%I', t);
    execute format('create policy lb_read_all on leaderboard.%I for select to authenticated using (true)', t);
    execute format('revoke all on leaderboard.%I from anon', t);
    execute format('grant select on leaderboard.%I to authenticated', t);
  end loop;
end $$;

create or replace view public.lb_news_hidden with (security_invoker = true) as
select post_id, title, hidden_at from leaderboard.news_hidden;

create or replace view public.lb_news_casts with (security_invoker = true) as
select id, post_id, title, excerpt, image, url, created_at
from leaderboard.news_casts
order by created_at desc
limit 20;

revoke all on public.lb_news_hidden, public.lb_news_casts from anon;
grant select on public.lb_news_hidden, public.lb_news_casts to authenticated;

create or replace function public.lb_admin_hide_news(p_post_id bigint, p_title text)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  insert into leaderboard.news_hidden (post_id, title, hidden_by)
  values (p_post_id, left(btrim(coalesce(p_title, '')), 300), auth.uid())
  on conflict (post_id) do update set title = excluded.title, hidden_at = now(), hidden_by = auth.uid();
end $$;

create or replace function public.lb_admin_show_news(p_post_id bigint)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  delete from leaderboard.news_hidden where post_id = p_post_id;
end $$;

create or replace function public.lb_admin_cast_news(
  p_post_id bigint, p_title text, p_excerpt text, p_image text, p_url text
)
returns uuid
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_id uuid;
begin
  perform public.lb_admin_guard();
  insert into leaderboard.news_casts (post_id, title, excerpt, image, url, created_by)
  values (p_post_id, left(btrim(p_title), 300), p_excerpt, p_image, p_url, auth.uid())
  returning id into v_id;
  -- السجل ما يكبرش: الشاشات بتقرا آخر واحد بس
  delete from leaderboard.news_casts
   where id not in (select id from leaderboard.news_casts order by created_at desc limit 50);
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lb_admin_save_news_settings(boolean, smallint, smallint, smallint, boolean, smallint, uuid)',
    'public.lb_admin_hide_news(bigint, text)',
    'public.lb_admin_show_news(bigint)',
    'public.lb_admin_cast_news(bigint, text, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- الشاشات بتسمع البث والإخفاء لحظياً
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['news_hidden', 'news_casts'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table leaderboard.%I', t);
      end if;
    end loop;
  end if;
end $$;
