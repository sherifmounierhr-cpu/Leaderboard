-- تعديل الصفقة من ملف Excel: المبلغ والتاريخ (والمستشار والفريق والمطوّر والمشروع).
--
-- الملف المصدَّر يحمل عمود id لكل صفقة. صف فيه id صفقة موجودة = تعديل لتلك
-- الصفقة نفسها بما في الصف، ومبيعات الربع تتصحّح معها (حتى لو انتقلت لربع آخر).
-- صف بلا id (أو id غير موجود) يمر بمنطق الإضافة كما كان.
--
-- تعديل نصّي على الدالة كما هي في القاعدة — بدون إعادة كتابة جسمها.
do $$
declare
  v_oid oid := 'public.lb_admin_import(smallint, jsonb)'::regprocedure;
  def   text := pg_get_functiondef(v_oid);
  a1 constant text := E'  v_moved   integer := 0;\n';
  a2 constant text := E'  for r in\n    with incoming as (';
  a3 constant text := E'      from jsonb_array_elements(coalesce(p_payload->''deals'', ''[]''::jsonb)) d\n    )';
  a4 constant text := '''deals_moved'', v_moved)';
  fixed text;
begin
  if position('v_updated' in def) > 0 then
    return; -- مطبَّق بالفعل
  end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 or position(a3 in def) = 0 or position(a4 in def) = 0 then
    raise exception 'lb_admin_import: لم يُعثر على موضع التعديل';
  end if;

  fixed := replace(def, a1, a1 || E'  v_updated integer := 0;\n  k         leaderboard.deals%rowtype;\n');

  -- صفوف الـ id تخرج من منطق الإضافة
  fixed := replace(fixed, a3,
    E'      from jsonb_array_elements(coalesce(p_payload->''deals'', ''[]''::jsonb)) d\n'
    || E'      where not exists (select 1 from leaderboard.deals e where e.id::text = lower(btrim(coalesce(d->>''id'', ''''))))\n    )');

  fixed := replace(fixed, a2, $block$  -- صفوف تحمل id صفقة موجودة: تعديل للصفقة نفسها
  for r in
    select lower(btrim(d->>'id'))                                     as id,
           nullif(btrim(d->>'agent'), '')                             as agent,
           nullif(btrim(coalesce(d->>'team', '')), '')                as team,
           (d->>'date')::date                                         as deal_date,
           round((d->>'amount')::numeric, 2)                          as amount,
           left(nullif(btrim(coalesce(d->>'developer', '')), ''), 80) as developer,
           left(nullif(btrim(coalesce(d->>'project', '')), ''), 80)   as project,
           (d->>'row')::integer                                       as row_no,
           (select a.id from leaderboard.agents a
             where lower(a.name) = lower(btrim(d->>'agent')) or lower(a.name_ar) = lower(btrim(d->>'agent'))
             order by (lower(a.name) = lower(btrim(d->>'agent'))) desc limit 1) as agent_id,
           (select t.id from leaderboard.teams t
             where lower(t.name) = lower(btrim(d->>'team')) or lower(t.name_ar) = lower(btrim(d->>'team'))
             order by (lower(t.name) = lower(btrim(d->>'team'))) desc limit 1) as team_id
    from jsonb_array_elements(coalesce(p_payload->'deals', '[]'::jsonb)) d
    where exists (select 1 from leaderboard.deals e where e.id::text = lower(btrim(coalesce(d->>'id', ''))))
    order by (d->>'row')::integer
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
      raise exception 'ورقة Deals، الصف %: المبلغ يجب أن يكون أكبر من صفر', r.row_no using errcode = '22023';
    end if;
    if r.deal_date is null or r.deal_date > v_today then
      raise exception 'ورقة Deals، الصف %: التاريخ لا يكون في المستقبل', r.row_no using errcode = '22023';
    end if;
    if r.deal_date < date '2020-01-01' then
      raise exception 'ورقة Deals، الصف %: التاريخ قديم جداً', r.row_no using errcode = '22023';
    end if;

    select * into k from leaderboard.deals where id = r.id::uuid;

    -- خانة الفريق فاضية: فريق الصفقة كما هو، أو فريق المستشار الجديد لو اتغيّر المستشار
    v_team := case
      when r.team is not null then r.team_id
      when r.agent_id = k.agent_id then k.team_id
      else (select team_id from leaderboard.agents where id = r.agent_id)
    end;

    if k.agent_id = r.agent_id and k.team_id is not distinct from v_team
       and k.deal_date = r.deal_date and k.amount_egp = r.amount
       and k.developer is not distinct from r.developer and k.project is not distinct from r.project then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update leaderboard.sales
       set amount_egp = greatest(amount_egp - k.amount_egp, 0)
     where agent_id = k.agent_id and year = k.year and quarter = k.quarter
       and team_id is not distinct from k.team_id;

    update leaderboard.deals
       set agent_id = r.agent_id, team_id = v_team, deal_date = r.deal_date, amount_egp = r.amount,
           developer = r.developer, project = r.project
     where id = k.id;

    insert into leaderboard.sales (agent_id, year, quarter, amount_egp, team_id)
    values (r.agent_id, extract(year from r.deal_date)::smallint, extract(quarter from r.deal_date)::smallint,
            r.amount, v_team)
    on conflict (agent_id, year, quarter, team_id)
    do update set amount_egp = leaderboard.sales.amount_egp + excluded.amount_egp;

    v_updated := v_updated + 1;
  end loop;

  -- صفقة مشتركة اتغيّر نصيب فيها: النسبة تتبع المبالغ الجديدة
  if v_updated > 0 then
    update leaderboard.deals d
       set share_pct = least(greatest(round(d.amount_egp * 100 / s.total, 2), 0.01), 99.99)
      from (select shared_id, sum(amount_egp) as total from leaderboard.deals
            where shared_id is not null group by shared_id) s
     where d.shared_id = s.shared_id and s.total > 0
       and d.share_pct is distinct from least(greatest(round(d.amount_egp * 100 / s.total, 2), 0.01), 99.99);
  end if;

$block$ || a2);

  fixed := replace(fixed, a4, a4 || ' || jsonb_build_object(''deals_updated'', v_updated)');
  execute fixed;
end $$;
