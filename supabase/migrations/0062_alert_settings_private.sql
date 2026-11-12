-- إعدادات تنبيه الشاشات (البريد والمدة والتشغيل) ما تظهرش لكل مستخدم مسجّل:
-- بتطلع من lb_board_settings، وصفحة الأجهزة بتقراها بدالة تتأكد من صلاحية «الأجهزة».
-- الدالة الطرفية screen-alert ما بتتأثرش: بتقرا الجدول مباشرة بصلاحية الخدمة.
drop view if exists public.lb_board_settings;
create view public.lb_board_settings with (security_invoker = true) as
 SELECT celebration_seconds, celebration_song_id, volume, updated_at,
    cbe_deposit, cbe_lending, cbe_rates_at,
    news_enabled, news_slide_s, news_repeats, news_gap_min, news_chime, news_volume, news_sound_id,
    celebration_lang,
    news_screen_s, insights_in_rotation, insights_screen_s,
    hide_agent_sales, hide_markets, hide_insights
   FROM leaderboard.board_settings
  WHERE (id = 1);
revoke all on public.lb_board_settings from public, anon;
grant select on public.lb_board_settings to authenticated;

create or replace function public.lb_admin_get_alert_settings()
returns table(alerts_enabled boolean, alert_email text, alert_after_min smallint)
language plpgsql
stable
security definer
set search_path to 'leaderboard', 'public'
as $function$
begin
  -- القراءة لمن يقدر يعدّل قسم الأجهزة (حساب الاطلاع/العرض ما يشوفش البريد)
  perform public.lb_require('devices');
  return query
  select b.alerts_enabled, b.alert_email, b.alert_after_min
    from leaderboard.board_settings b where b.id = 1;
end $function$;

revoke all on function public.lb_admin_get_alert_settings() from public, anon;
grant execute on function public.lb_admin_get_alert_settings() to authenticated;

-- الـ views دي للقراءة بس: نشيل صلاحيات الكتابة الافتراضية عنها (كانت INSERT/UPDATE/DELETE
-- ظاهرة لـ authenticated، وقبل 0061 كانت بتعدّي RLS لأنها كانت بصلاحيات المالك).
revoke insert, update, delete, truncate, references, trigger on
  public.lb_agent_standings, public.lb_deals, public.lb_sale_events,
  public.lb_team_contributions, public.lb_team_standings
  from authenticated, anon, public;
