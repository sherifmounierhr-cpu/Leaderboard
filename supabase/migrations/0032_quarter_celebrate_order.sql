-- ترتيب عرض احتفال نهاية الربع: من الأقل تحقيقاً للأعلى، فيُختم بالأول — تشويق
-- الجوائز المعتاد. ترتيب الإدراج هو ترتيب العرض على الشاشة (نفس منطق 0031).

create or replace function public.lb_admin_celebrate_quarter(
  p_year smallint, p_quarter smallint, p_team_note text, p_agent_note text
) returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_team_note  text := nullif(btrim(p_team_note), '');
  v_agent_note text := nullif(btrim(p_agent_note), '');
  v_teams      int := 0;
  v_managers   int := 0;
  v_agents     int := 0;
  r            record;
  m            record;
begin
  perform public.lb_require('celebrate');

  if p_year is null or p_quarter is null or p_quarter not between 1 and 4 then
    raise exception 'ربع غير صالح' using errcode = '22023';
  end if;
  if char_length(v_team_note) > 140 or char_length(v_agent_note) > 140 then
    raise exception 'الرسالة أطول من 140 حرفاً' using errcode = '22023';
  end if;

  -- الفرق اللي عملت أي مبيعات في الربع — من الأقل مبيعات للأعلى
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

    for m in
      select l.agent_id
      from leaderboard.team_leads l
      join leaderboard.agents a on a.id = l.agent_id and a.active
      where l.team_id = r.team_id and l.role = 'manager'
      order by l.position
    loop
      insert into leaderboard.sale_events (agent_id, year, quarter, kind, total_egp, note, created_by)
      values (
        m.agent_id, p_year, p_quarter, 'quarter',
        coalesce((select sum(amount_egp) from leaderboard.sales
                  where agent_id = m.agent_id and year = p_year and quarter = p_quarter), 0),
        v_team_note, auth.uid()
      );
      v_managers := v_managers + 1;
    end loop;
  end loop;

  -- كل مستشار عمل أي مبيعات في الربع — من الأقل مبيعات للأعلى
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

  return jsonb_build_object('teams', v_teams, 'managers', v_managers, 'agents', v_agents);
end $fn$;

revoke all on function public.lb_admin_celebrate_quarter(smallint, smallint, text, text) from public, anon;
grant execute on function public.lb_admin_celebrate_quarter(smallint, smallint, text, text) to authenticated;
