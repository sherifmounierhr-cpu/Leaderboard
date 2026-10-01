-- صور مديري الفرق "المعزولة" (بلا خلفية) لتقف فوق صورة الفريق في احتفال
-- نهاية الربع. تُولَّد في متصفح الإدارة وتُرفع لنفس bucket الصور.

alter table leaderboard.agents add column if not exists cutout_url text;

-- تغيير الصورة الأصلية يُسقط الصورة المعزولة القديمة، فلا تظهر صورة قديمة بالغلط
create or replace function leaderboard.agents_reset_cutout()
returns trigger
language plpgsql
as $$
begin
  if new.photo_url is distinct from old.photo_url and new.cutout_url is not distinct from old.cutout_url then
    new.cutout_url := null;
  end if;
  return new;
end $$;

drop trigger if exists agents_reset_cutout on leaderboard.agents;
create trigger agents_reset_cutout
before update on leaderboard.agents
for each row execute function leaderboard.agents_reset_cutout();

create or replace view public.lb_team_events
with (security_invoker = true) as
select
  e.id, e.team_id, e.year, e.quarter, e.kind, e.total_egp, e.note, e.song_id, e.mute, e.duration_s, e.created_at,
  t.name, t.name_ar, t.photo_url,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'name_ar', a.name_ar, 'photo_url', a.photo_url, 'cutout_url', a.cutout_url
    ) order by l.position)
    from leaderboard.team_leads l
    join leaderboard.agents a on a.id = l.agent_id
    where l.team_id = t.id and l.role = 'manager'
  ), '[]'::jsonb) as managers
from leaderboard.team_events e
join leaderboard.teams t on t.id = e.team_id;

revoke all on public.lb_team_events from anon;
grant select on public.lb_team_events to authenticated;

-- كل مديري الفرق النشطين، مرة واحدة لكل مدير، لقسم الصور المعزولة في الإدارة
create or replace view public.lb_team_managers
with (security_invoker = true) as
select distinct on (a.id)
  a.id, a.name, a.name_ar, a.photo_url, a.cutout_url, t.name as team, t.name_ar as team_ar
from leaderboard.team_leads l
join leaderboard.agents a on a.id = l.agent_id and a.active
join leaderboard.teams t on t.id = l.team_id
where l.role = 'manager'
order by a.id, t.name;

revoke all on public.lb_team_managers from anon;
grant select on public.lb_team_managers to authenticated;

create or replace function public.lb_admin_set_cutout(p_agent_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $$
begin
  perform public.lb_require('celebrate');
  update leaderboard.agents set cutout_url = nullif(btrim(p_url), '') where id = p_agent_id;
  if not found then
    raise exception 'المستشار غير موجود' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.lb_admin_set_cutout(uuid, text) from public, anon;
grant execute on function public.lb_admin_set_cutout(uuid, text) to authenticated;

-- المديرون اللي باعوا بأنفسهم يرجعوا لاحتفال الأفراد بترتيبهم الحقيقي (الأول والتالت
-- مثلاً كانوا مختفيين). اللي اتلغى بس هو البطاقة المنفصلة "شكر المدير".
create or replace function public.lb_admin_celebrate_quarter(
  p_year smallint,
  p_quarter smallint,
  p_team_note text,
  p_agent_note text,
  p_intro_message text default null,
  p_intro_song_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
declare
  v_team_note  text := nullif(btrim(p_team_note), '');
  v_agent_note text := nullif(btrim(p_agent_note), '');
  v_intro_msg  text := nullif(btrim(p_intro_message), '');
  v_teams      int := 0;
  v_agents     int := 0;
  r            record;
begin
  perform public.lb_require('celebrate');

  if p_year is null or p_quarter is null or p_quarter not between 1 and 4 then
    raise exception 'ربع غير صالح' using errcode = '22023';
  end if;
  if char_length(v_team_note) > 140 or char_length(v_agent_note) > 140 then
    raise exception 'الرسالة أطول من 140 حرفاً' using errcode = '22023';
  end if;
  if char_length(v_intro_msg) > 280 then
    raise exception 'كلمة الإدارة أطول من 280 حرفاً' using errcode = '22023';
  end if;

  insert into leaderboard.celebration_intros (year, quarter, kind, message, song_id, created_by)
  values (p_year, p_quarter, 'quarter', v_intro_msg, p_intro_song_id, auth.uid());

  for r in
    select t.id as team_id, sum(s.amount_egp) as total
    from leaderboard.teams t
    join leaderboard.sales s on s.team_id = t.id and s.year = p_year and s.quarter = p_quarter
    where t.active
    group by t.id
    having sum(s.amount_egp) > 0
    order by sum(s.amount_egp) asc
  loop
    insert into leaderboard.team_events (team_id, year, quarter, kind, total_egp, note, created_by)
    values (r.team_id, p_year, p_quarter, 'quarter', r.total, v_team_note, auth.uid());
    v_teams := v_teams + 1;
  end loop;

  for r in
    select s.agent_id, sum(s.amount_egp) as total
    from leaderboard.sales s
    join leaderboard.agents a on a.id = s.agent_id and a.active
    where s.year = p_year and s.quarter = p_quarter
    group by s.agent_id
    having sum(s.amount_egp) > 0
    order by sum(s.amount_egp) asc
  loop
    insert into leaderboard.sale_events (agent_id, year, quarter, kind, total_egp, note, created_by)
    values (r.agent_id, p_year, p_quarter, 'quarter', r.total, v_agent_note, auth.uid());
    v_agents := v_agents + 1;
  end loop;

  return jsonb_build_object('teams', v_teams, 'agents', v_agents);
end
$function$;
