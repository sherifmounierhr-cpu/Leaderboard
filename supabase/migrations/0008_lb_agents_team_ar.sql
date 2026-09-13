-- صفحة الإدارة كانت تعرض اسم الفرع بالإنجليزية فقط بينما اللوحة تعرضه
-- بالعربية، لأن هذه الـ view لا ترجّع الاسم العربي أصلاً.
--
-- يُضاف العمود في آخر القائمة لأن create or replace view لا يسمح بإدراج
-- عمود في المنتصف. الاسم الإنجليزي يبقى كما هو: هو مفتاح مطابقة الصفوف في
-- التصدير والاستيراد ومزامنة جوجل شيت، والعربي للعرض فقط.

create or replace view public.lb_agents with (security_invoker = true) as
select
  a.id,
  a.name,
  a.name_ar,
  a.team_id,
  t.name as team_name,
  a.photo_url,
  a.active,
  a.created_at,
  t.name_ar as team_name_ar
from leaderboard.agents a
left join leaderboard.teams t on t.id = a.team_id;

revoke all on public.lb_agents from anon;
grant select on public.lb_agents to authenticated;
