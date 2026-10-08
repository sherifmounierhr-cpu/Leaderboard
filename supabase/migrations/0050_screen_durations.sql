-- مدة شاشة الأخبار وشاشة التحليلات في التبديل التلقائي.
--   news_screen_s        : مدة شاشة الأخبار كلها بالثواني؛ null = تلقائي (عدد الأخبار × مدة الخبر).
--   insights_in_rotation : التحليلات تدخل التبديل التلقائي (كانت تُفتح يدوياً فقط).
--   insights_screen_s    : كم ثانية تبقى شاشة التحليلات.
alter table leaderboard.board_settings
  add column if not exists news_screen_s smallint check (news_screen_s is null or news_screen_s between 10 and 900),
  add column if not exists insights_in_rotation boolean not null default false,
  add column if not exists insights_screen_s smallint not null default 30 check (insights_screen_s between 10 and 600);

create or replace view public.lb_board_settings as
 SELECT celebration_seconds,
    celebration_song_id,
    volume,
    updated_at,
    cbe_deposit,
    cbe_lending,
    cbe_rates_at,
    news_enabled,
    news_slide_s,
    news_repeats,
    news_gap_min,
    news_chime,
    news_volume,
    news_sound_id,
    alerts_enabled,
    alert_email,
    alert_after_min,
    celebration_lang,
    news_screen_s,
    insights_in_rotation,
    insights_screen_s
   FROM leaderboard.board_settings
  WHERE (id = 1);

create or replace function public.lb_admin_save_screen_durations(
  p_news_screen_s smallint, p_insights_on boolean, p_insights_s smallint
)
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
begin
  perform public.lb_require('newsfeed');
  if p_news_screen_s is not null and p_news_screen_s not between 10 and 900 then
    raise exception 'مدة شاشة الأخبار بين 10 و900 ثانية' using errcode = '22023';
  end if;
  if p_insights_s is null or p_insights_s not between 10 and 600 then
    raise exception 'مدة شاشة التحليلات بين 10 و600 ثانية' using errcode = '22023';
  end if;
  update leaderboard.board_settings
     set news_screen_s = p_news_screen_s,
         insights_in_rotation = coalesce(p_insights_on, false),
         insights_screen_s = p_insights_s,
         updated_at = now()
   where id = 1;
end $function$;

revoke all on function public.lb_admin_save_screen_durations(smallint, boolean, smallint) from public, anon;
grant execute on function public.lb_admin_save_screen_durations(smallint, boolean, smallint) to authenticated, service_role;
