-- إخفاء مبالغ مبيعات الأفراد من الشاشات.
--   hide_agent_sales: لو true، الشاشات ما تعرضش مبلغ مبيعات المستشار (ترتيب المستشارين،
--   بطاقة الأعلى أداءً، آخر الصفقات، الإشعارات، شاشة الاحتفال). إجماليات الفرق والتارجت
--   بتفضل ظاهرة. الإعداد بيتغيّر من الإدارة وبيوصل كل الشاشات لحظياً.
alter table leaderboard.board_settings
  add column if not exists hide_agent_sales boolean not null default false;

create or replace view public.lb_board_settings as
 SELECT celebration_seconds, celebration_song_id, volume, updated_at,
    cbe_deposit, cbe_lending, cbe_rates_at,
    news_enabled, news_slide_s, news_repeats, news_gap_min, news_chime, news_volume, news_sound_id,
    alerts_enabled, alert_email, alert_after_min, celebration_lang,
    news_screen_s, insights_in_rotation, insights_screen_s,
    hide_agent_sales
   FROM leaderboard.board_settings
  WHERE (id = 1);

create or replace function public.lb_admin_set_hide_agent_sales(p_hide boolean)
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
begin
  perform public.lb_require('celebrate');
  update leaderboard.board_settings
     set hide_agent_sales = coalesce(p_hide, false), updated_at = now()
   where id = 1;
end $function$;

revoke all on function public.lb_admin_set_hide_agent_sales(boolean) from public, anon;
grant execute on function public.lb_admin_set_hide_agent_sales(boolean) to authenticated, service_role;
