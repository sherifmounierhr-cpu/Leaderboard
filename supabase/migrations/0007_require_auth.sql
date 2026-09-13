-- إغلاق اللوحة على المسجَّلين فقط.
--
-- شاشة الدخول في التطبيق وحدها ليست حماية: المفتاح publishable موجود داخل
-- الجافاسكريبت، فأي شخص كان يقدر يستدعي الـ API مباشرةً ويقرأ كل الأرقام دون
-- المرور على الشاشة. الحماية الفعلية هنا — في صلاحيات القاعدة.
--
-- بعد هذا الملف: الدور anon لا يقرأ شيئاً من بيانات اللوحة، و authenticated
-- يقرأ كالمعتاد، و service_role (المزامنة) يتجاوز RLS كما هو.

-- 1) سياسة القراءة تصبح للمسجَّلين فقط
do $$
declare t text;
begin
  foreach t in array array['teams','agents','targets','sales','snapshots'] loop
    execute format('drop policy if exists lb_read_all on leaderboard.%I', t);
    execute format(
      'create policy lb_read_all on leaderboard.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- 2) سحب صلاحيات الجداول من anon (الـ views بـ security_invoker،
--    فصلاحية المستدعي على الجداول هي الفاصل الحقيقي)
revoke select on leaderboard.teams, leaderboard.agents, leaderboard.targets,
                leaderboard.sales, leaderboard.snapshots from anon;

-- 3) سحب صلاحيات الـ views المكشوفة
revoke select on public.lb_team_standings, public.lb_agent_standings,
                 public.lb_rank_history, public.lb_previous_ranks from anon;

-- 4) بلا usage على الـ schema لا يصل anon إلى أي شيء داخلها أصلاً
revoke usage on schema leaderboard from anon;

-- 5) تأكيد صريح أن المسجَّلين ما زالوا يقرأون
grant usage on schema leaderboard to authenticated;
grant select on leaderboard.teams, leaderboard.agents, leaderboard.targets,
                leaderboard.sales, leaderboard.snapshots to authenticated;
grant select on public.lb_team_standings, public.lb_agent_standings,
                public.lb_rank_history, public.lb_previous_ranks to authenticated;
