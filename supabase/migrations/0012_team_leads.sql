-- قيادة الفريق: مدير الفريق ومشرفه (اختياري)، يُختاران من المستشارين.
--
-- مرجع إلى agents لا نص حر: الاسم والصورة يأتيان من سجل المستشار فيبقيان
-- متطابقين معه. حذف المستشار يفرّغ الخانة بدل أن يمنع الحذف. المستشار غير
-- النشط يصلح قائداً — مدير لا يبيع يُضاف مستشاراً غير نشط فلا يظهر في الترتيب.

alter table leaderboard.teams
  add column if not exists manager_agent_id uuid references leaderboard.agents (id) on delete set null,
  add column if not exists supervisor_agent_id uuid references leaderboard.agents (id) on delete set null;

alter table leaderboard.teams drop constraint if exists teams_leads_distinct;
alter table leaderboard.teams add constraint teams_leads_distinct
  check (manager_agent_id is null or supervisor_agent_id is null or manager_agent_id <> supervisor_agent_id);

-- ------------------------------------------------------------ الإدارة
-- أعمدة جديدة في آخر القائمة: create or replace view لا يقبل الإدراج في الوسط
create or replace view public.lb_teams
with (security_invoker = true) as
select id, name, name_ar, photo_url, active, created_at, manager_agent_id, supervisor_agent_id
from leaderboard.teams;

create or replace function public.lb_admin_set_team_leads(
  p_team_id uuid,
  p_manager_id uuid default null,
  p_supervisor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  perform public.lb_admin_guard();
  if p_manager_id is not null and p_manager_id = p_supervisor_id then
    raise exception 'المدير والمشرف لازم يكونوا شخصين مختلفين' using errcode = '22023';
  end if;

  update leaderboard.teams
  set manager_agent_id = p_manager_id, supervisor_agent_id = p_supervisor_id
  where id = p_team_id;
  if not found then
    raise exception 'الفريق غير موجود' using errcode = 'P0002';
  end if;
end $fn$;

revoke all on function public.lb_admin_set_team_leads(uuid, uuid, uuid) from public, anon;
grant execute on function public.lb_admin_set_team_leads(uuid, uuid, uuid) to authenticated;

-- ------------------------------------------------------------ اللوحة
create or replace view public.lb_team_standings
with (security_invoker = true) as
with per_team as (
  select t.id as team_id, t.name, t.name_ar, t.photo_url, s.year, s.quarter,
    sum(coalesce(s.amount_egp, 0)) as deals,
    sum(coalesce(g.target_egp, 0)) as target,
    count(distinct a.id)::int as members
  from leaderboard.sales s
  join leaderboard.agents a on a.id = s.agent_id and a.active
  join leaderboard.teams t on t.id = a.team_id and t.active
  left join leaderboard.targets g on g.agent_id = a.id and g.year = s.year and g.quarter = s.quarter
  group by t.id, t.name, t.name_ar, t.photo_url, s.year, s.quarter
)
select p.team_id, p.name, p.name_ar, p.photo_url, p.year, p.quarter, p.deals, p.target, p.members,
  case when p.target > 0 then round(p.deals / p.target * 100)::int else 0 end as pct,
  rank() over (partition by p.year, p.quarter order by p.deals desc, p.name)::int as rank,
  m.id        as manager_id,
  m.name      as manager_name,
  m.name_ar   as manager_name_ar,
  m.photo_url as manager_photo_url,
  v.id        as supervisor_id,
  v.name      as supervisor_name,
  v.name_ar   as supervisor_name_ar,
  v.photo_url as supervisor_photo_url
from per_team p
join leaderboard.teams t on t.id = p.team_id
left join leaderboard.agents m on m.id = t.manager_agent_id
left join leaderboard.agents v on v.id = t.supervisor_agent_id;
