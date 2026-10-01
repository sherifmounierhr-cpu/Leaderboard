-- إلغاء بطاقة التهنئة المنفصلة لمديري الفرق: تقديرهم بقى داخل بطاقة فريقهم
-- فقط (صورتهم الكبيرة على نص الشاشة)، فلا داعي لبطاقة فردية إضافية بعدها.
-- كمان: مدير باع بنفسه ما يدخلش في حلقة "كل مستشار باع" فما يتكررش له بطاقة.
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

  -- فردي لكل مستشار باع، إلا مديري الفرق — تقديرهم داخل بطاقة فريقهم فقط، بلا بطاقة منفصلة
  for r in
    select s.agent_id, sum(s.amount_egp) as total
    from leaderboard.sales s
    join leaderboard.agents a on a.id = s.agent_id and a.active
    where s.year = p_year and s.quarter = p_quarter
      and not exists (
        select 1 from leaderboard.team_leads l where l.agent_id = s.agent_id and l.role = 'manager'
      )
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
