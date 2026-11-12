-- ست views فقدت security_invoker عند إعادة إنشائها (0050, 0054, 0055, 0058, 0059…): كانت بتشتغل
-- بصلاحيات المالك وتتخطى RLS. نرجّعها تشتغل بصلاحيات المستدعي زي باقي الـ lb_* views.
-- اتجرّبت كـ authenticated قبل التطبيق: كل واحد بيرجّع صفوفه زي الأول.
alter view public.lb_agent_standings     set (security_invoker = true);
alter view public.lb_board_settings      set (security_invoker = true);
alter view public.lb_deals               set (security_invoker = true);
alter view public.lb_sale_events         set (security_invoker = true);
alter view public.lb_team_contributions  set (security_invoker = true);
alter view public.lb_team_standings      set (security_invoker = true);
