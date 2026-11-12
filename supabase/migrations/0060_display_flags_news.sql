-- مفاتيح العرض: تشغيل الأخبار وإدخال التحليلات في التبديل صاروا قابلين للتغيير من لوحة
-- «التحكم في العرض» بضغطة (من غير ما يلمسوا باقي إعدادات الأخبار). صلاحية كل مفتاح
-- زي أصله: مفاتيح الإخفاء = celebrate، ومفاتيح الأخبار/التحليلات = newsfeed.
create or replace function public.lb_admin_set_display_flag(p_key text, p_on boolean)
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
begin
  if p_key in ('hide_agent_sales', 'hide_markets', 'hide_insights') then
    perform public.lb_require('celebrate');
  elsif p_key in ('news_enabled', 'insights_in_rotation') then
    perform public.lb_require('newsfeed');
  else
    raise exception 'مفتاح عرض غير معروف' using errcode = '22023';
  end if;
  update leaderboard.board_settings
     set hide_agent_sales    = case when p_key = 'hide_agent_sales'    then coalesce(p_on, false) else hide_agent_sales end,
         hide_markets        = case when p_key = 'hide_markets'        then coalesce(p_on, false) else hide_markets end,
         hide_insights       = case when p_key = 'hide_insights'       then coalesce(p_on, false) else hide_insights end,
         news_enabled        = case when p_key = 'news_enabled'        then coalesce(p_on, false) else news_enabled end,
         insights_in_rotation = case when p_key = 'insights_in_rotation' then coalesce(p_on, false) else insights_in_rotation end,
         updated_at = now()
   where id = 1;
end $function$;
