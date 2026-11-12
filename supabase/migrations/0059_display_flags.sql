-- مفاتيح العرض: إخفاء شاشة الأسواق وشاشة التحليلات من اللوحة (التدوير والتبديل اليدوي).
-- لوحة «التحكم في العرض» بتغيّرها كلها عبر دالة واحدة بقايمة مفاتيح مسموحة.
alter table leaderboard.board_settings
  add column if not exists hide_markets  boolean not null default false,
  add column if not exists hide_insights boolean not null default false;

create or replace view public.lb_board_settings as
 SELECT celebration_seconds, celebration_song_id, volume, updated_at,
    cbe_deposit, cbe_lending, cbe_rates_at,
    news_enabled, news_slide_s, news_repeats, news_gap_min, news_chime, news_volume, news_sound_id,
    alerts_enabled, alert_email, alert_after_min, celebration_lang,
    news_screen_s, insights_in_rotation, insights_screen_s,
    hide_agent_sales, hide_markets, hide_insights
   FROM leaderboard.board_settings
  WHERE (id = 1);

create or replace function public.lb_admin_set_display_flag(p_key text, p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
begin
  perform public.lb_require('celebrate');
  if p_key not in ('hide_agent_sales', 'hide_markets', 'hide_insights') then
    raise exception 'مفتاح عرض غير معروف' using errcode = '22023';
  end if;
  update leaderboard.board_settings
     set hide_agent_sales = case when p_key = 'hide_agent_sales' then coalesce(p_on, false) else hide_agent_sales end,
         hide_markets     = case when p_key = 'hide_markets'     then coalesce(p_on, false) else hide_markets end,
         hide_insights    = case when p_key = 'hide_insights'    then coalesce(p_on, false) else hide_insights end,
         updated_at = now()
   where id = 1;
end $function$;

revoke all on function public.lb_admin_set_display_flag(text, boolean) from public, anon;
grant execute on function public.lb_admin_set_display_flag(text, boolean) to authenticated, service_role;
