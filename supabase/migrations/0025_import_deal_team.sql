-- فريق الصفقة من ورقة Deals.
--
-- قبل كده عمود team في Deals كان للعرض بس، والصفقة بتتسجّل على فريق المستشار
-- الحالي. للبيانات القديمة ده غلط لو المستشار اتنقل بعد الصفقة، فالعمود بقى
-- له معنى: فريق المستشار وقت الصفقة. فاضي = فريقه الحالي (زي «إضافة صفقة»).
-- الفريق جزء من مفتاح عدم التكرار: الملف المصدَّر بيكتب فريق كل صفقة، فإعادة
-- رفعه بتلاقي نفس الصفقة بنفس الفريق.
--
-- باقي المنطق زي 0024 بالظبط.

create or replace function public.lb_admin_import(p_year smallint, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_result  jsonb;
  v_today   date := (now() at time zone 'Africa/Cairo')::date;
  v_added   integer := 0;
  v_skipped integer := 0;
  r         record;
  v_team    uuid;
  v_need    integer;
begin
  perform public.lb_require('data');

  if p_year is null or p_year < 2020 or p_year > 2100 then
    raise exception 'سنة غير صالحة' using errcode = '22023';
  end if;

  perform set_config('leaderboard.silent', 'on', true);

  -- الفرق والمستشارون والأهداف والإجماليات — نفس منطق مزامنة جوجل شيت
  v_result := public.lb_sync(p_year, p_payload);

  -- الصفقات: مجمّعة بمفتاحها، ويُضاف فقط ما يزيد عن الموجود بنفس المفتاح
  for r in
    with incoming as (
      select
        nullif(btrim(d->>'agent'), '')                             as agent,
        nullif(btrim(coalesce(d->>'team', '')), '')                as team,
        (d->>'date')::date                                         as deal_date,
        round((d->>'amount')::numeric, 2)                          as amount,
        left(nullif(btrim(coalesce(d->>'developer', '')), ''), 80) as developer,
        left(nullif(btrim(coalesce(d->>'project', '')), ''), 80)   as project,
        (d->>'row')::integer                                       as row_no
      from jsonb_array_elements(coalesce(p_payload->'deals', '[]'::jsonb)) d
    )
    select i.agent, i.team, i.deal_date, i.amount, i.developer, i.project,
           count(*)::integer as copies, min(i.row_no) as row_no,
           (select a.id from leaderboard.agents a
             where lower(a.name) = lower(i.agent) or lower(a.name_ar) = lower(i.agent)
             order by (lower(a.name) = lower(i.agent)) desc limit 1) as agent_id,
           (select t.id from leaderboard.teams t
             where lower(t.name) = lower(i.team) or lower(t.name_ar) = lower(i.team)
             order by (lower(t.name) = lower(i.team)) desc limit 1) as team_id
    from incoming i
    group by i.agent, i.team, i.deal_date, i.amount, i.developer, i.project
    order by min(i.row_no)
  loop
    if r.agent_id is null then
      raise exception 'ورقة Deals، الصف %: المستشار «%» غير موجود في ورقة Agents ولا في اللوحة', r.row_no, r.agent
        using errcode = '22023';
    end if;
    if r.team is not null and r.team_id is null then
      raise exception 'ورقة Deals، الصف %: الفريق «%» غير موجود في ورقة Teams ولا في اللوحة', r.row_no, r.team
        using errcode = '22023';
    end if;
    if r.amount is null or r.amount <= 0 then
      raise exception 'ورقة Deals، الصف %: المبلغ لازم يكون أكبر من صفر', r.row_no using errcode = '22023';
    end if;
    if r.deal_date is null or r.deal_date > v_today then
      raise exception 'ورقة Deals، الصف %: التاريخ لا يكون في المستقبل', r.row_no using errcode = '22023';
    end if;
    if r.deal_date < date '2020-01-01' then
      raise exception 'ورقة Deals، الصف %: التاريخ قديم جداً', r.row_no using errcode = '22023';
    end if;

    -- فريق الصفقة: من الملف، وإلا فريق المستشار الحالي
    v_team := coalesce(r.team_id, (select team_id from leaderboard.agents where id = r.agent_id));

    select r.copies - count(*) into v_need
    from leaderboard.deals d
    where d.agent_id = r.agent_id and d.deal_date = r.deal_date and d.amount_egp = r.amount
      and d.developer is not distinct from r.developer and d.project is not distinct from r.project
      and d.team_id is not distinct from v_team;

    v_skipped := v_skipped + (r.copies - greatest(v_need, 0));
    continue when v_need <= 0;

    insert into leaderboard.deals (agent_id, team_id, deal_date, amount_egp, developer, project, created_by)
    select r.agent_id, v_team, r.deal_date, r.amount, r.developer, r.project, auth.uid()
    from generate_series(1, v_need);

    insert into leaderboard.sales (agent_id, year, quarter, amount_egp, team_id)
    values (r.agent_id, extract(year from r.deal_date)::smallint, extract(quarter from r.deal_date)::smallint,
            r.amount * v_need, v_team)
    on conflict (agent_id, year, quarter, team_id)
    do update set amount_egp = leaderboard.sales.amount_egp + excluded.amount_egp;

    v_added := v_added + v_need;
  end loop;

  -- أرباع ورقة Agents: الإجمالي = المبيعات غير المفصّلة + كل صفقات الربع
  for r in
    select ag.id as agent_id, (p->>'quarter')::smallint as quarter,
           coalesce((p->>'deals')::numeric, 0) as extra
    from jsonb_array_elements(coalesce(p_payload->'agents', '[]'::jsonb)) a
    join leaderboard.agents ag on ag.name = btrim(a->>'name')
    cross join lateral jsonb_array_elements(coalesce(a->'periods', '[]'::jsonb)) p
  loop
    perform leaderboard.set_agent_sales(
      r.agent_id, p_year, r.quarter,
      r.extra + coalesce((select sum(amount_egp) from leaderboard.deals
                          where agent_id = r.agent_id and year = p_year and quarter = r.quarter), 0)
    );
  end loop;

  return v_result || jsonb_build_object('deals', v_added, 'deals_skipped', v_skipped);
end $fn$;

revoke all on function public.lb_admin_import(smallint, jsonb) from public, anon;
grant execute on function public.lb_admin_import(smallint, jsonb) to authenticated;
