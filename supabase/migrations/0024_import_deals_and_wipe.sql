-- استيراد الصفقات من Excel + مسح البيانات قبل إدخال بيانات جديدة.
--
-- معنى الأعمدة في الملف:
--   q*_deals في ورقة Agents = مبيعات الربع «غير المسجّلة كصفقات» في ورقة Deals.
--   إجمالي الربع = q*_deals + كل صفقات الربع.
-- التصدير يكتب q*_deals بنفس المعنى (الإجمالي ناقص الصفقات)، فكل الحالات
-- صحيحة: إعادة رفع نفس الملف، أو المسح ثم رفع ملف قديم، أو إدخال من الصفر.
--
-- الصفقة الموجودة بالفعل (نفس المستشار والتاريخ والمبلغ والمطوّر والمشروع)
-- لا تتكرر — فرفع نفس الملف مرتين لا يضاعف شيئاً.
--
-- الاستيراد صامت: إدخال بيانات بالجملة لا يطلق احتفالات على الشاشات.

-- ==================================================================
-- كتم أحداث البيع أثناء الاستيراد والمسح
-- ==================================================================
create or replace function leaderboard.record_sale_event()
returns trigger
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_now    timestamp := now() at time zone 'Africa/Cairo';
  v_year   smallint  := extract(year from v_now);
  v_q      smallint  := extract(quarter from v_now);
  v_before numeric   := case when tg_op = 'UPDATE' then old.amount_egp else 0 end;
  v_total  numeric;
begin
  -- يُضبط داخل معاملة الاستيراد فقط (set_config(..., true))، فينتهي معها
  if current_setting('leaderboard.silent', true) = 'on' then
    return new;
  end if;

  if new.amount_egp > v_before and new.year = v_year and new.quarter = v_q then
    select coalesce(sum(amount_egp), 0) into v_total from leaderboard.sales
    where agent_id = new.agent_id and year = new.year and quarter = new.quarter;
    insert into leaderboard.sale_events (agent_id, year, quarter, kind, amount_egp, total_egp, created_by)
    values (new.agent_id, new.year, new.quarter, 'sale', new.amount_egp - v_before, v_total, auth.uid());
  end if;
  return new;
end $fn$;

-- ==================================================================
-- الاستيراد
-- ==================================================================
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
        nullif(btrim(d->>'agent'), '')                         as agent,
        (d->>'date')::date                                     as deal_date,
        round((d->>'amount')::numeric, 2)                      as amount,
        left(nullif(btrim(coalesce(d->>'developer', '')), ''), 80) as developer,
        left(nullif(btrim(coalesce(d->>'project', '')), ''), 80)   as project,
        (d->>'row')::integer                                   as row_no
      from jsonb_array_elements(coalesce(p_payload->'deals', '[]'::jsonb)) d
    )
    select i.agent, i.deal_date, i.amount, i.developer, i.project,
           count(*)::integer as copies, min(i.row_no) as row_no,
           (select a.id from leaderboard.agents a
             where lower(a.name) = lower(i.agent) or lower(a.name_ar) = lower(i.agent)
             order by (lower(a.name) = lower(i.agent)) desc limit 1) as agent_id
    from incoming i
    group by i.agent, i.deal_date, i.amount, i.developer, i.project
    order by min(i.row_no)
  loop
    if r.agent_id is null then
      raise exception 'ورقة Deals، الصف %: المستشار «%» غير موجود في ورقة Agents ولا في اللوحة', r.row_no, r.agent
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

    select r.copies - count(*) into v_need
    from leaderboard.deals d
    where d.agent_id = r.agent_id and d.deal_date = r.deal_date and d.amount_egp = r.amount
      and d.developer is not distinct from r.developer and d.project is not distinct from r.project;

    v_skipped := v_skipped + (r.copies - greatest(v_need, 0));
    continue when v_need <= 0;

    select team_id into v_team from leaderboard.agents where id = r.agent_id;

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

-- ==================================================================
-- المسح
-- ==================================================================
alter table leaderboard.maintenance_log drop constraint if exists maintenance_log_kind_check;
alter table leaderboard.maintenance_log
  add constraint maintenance_log_kind_check check (kind in ('backup', 'cleanup', 'access', 'wipe'));

-- p_scope: 'sales' = الأهداف والمبيعات والصفقات والإشعارات وسجل الترتيب
--          'all'   = كل ده + الفرق والمستشارين (وقيادات الفرق معهم)
-- لا يلمس: المستخدمين، الأجهزة، الصوتيات والرسائل، الإعدادات، الأخبار.
-- p_confirm: كلمة التأكيد نفسها تُتحقَّق هنا، فنداء بالخطأ لا يمسح شيئاً.
create or replace function public.lb_admin_wipe(p_scope text, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_counts jsonb;
begin
  perform public.lb_require('data');
  if not public.is_admin() then
    raise exception 'مسح البيانات للمسؤول الكامل فقط' using errcode = '42501';
  end if;
  if p_scope not in ('sales', 'all') then
    raise exception 'نطاق مسح غير معروف' using errcode = '22023';
  end if;
  if coalesce(btrim(p_confirm), '') not in ('مسح', 'DELETE') then
    raise exception 'كلمة التأكيد غير صحيحة — لم يُمسح شيء' using errcode = '22023';
  end if;

  perform set_config('leaderboard.silent', 'on', true);

  v_counts := jsonb_build_object(
    'deals',     (select count(*) from leaderboard.deals),
    'sales',     (select count(*) from leaderboard.sales),
    'targets',   (select count(*) from leaderboard.targets),
    'events',    (select count(*) from leaderboard.sale_events),
    'snapshots', (select count(*) from leaderboard.snapshots),
    'agents',    case when p_scope = 'all' then (select count(*) from leaderboard.agents) else 0 end,
    'teams',     case when p_scope = 'all' then (select count(*) from leaderboard.teams) else 0 end
  );

  delete from leaderboard.deals;
  delete from leaderboard.sale_events;
  delete from leaderboard.sales;
  delete from leaderboard.targets;
  delete from leaderboard.snapshots;

  if p_scope = 'all' then
    delete from leaderboard.team_leads;
    delete from leaderboard.agents;
    delete from leaderboard.teams;
  end if;

  insert into leaderboard.maintenance_log (kind, details)
  values ('wipe', v_counts || jsonb_build_object('scope', p_scope));

  return v_counts;
end $fn$;

revoke all on function public.lb_admin_wipe(text, text) from public, anon;
grant execute on function public.lb_admin_wipe(text, text) to authenticated;
