-- تعديل صفقة بعد إضافتها: المستشار، الفريق، التاريخ، المبلغ، المطوّر، المشروع، والمشاركة.
-- التعديل = عكس الصفقة القديمة ثم تسجيلها من جديد بنفس قواعد الإضافة، في عملية
-- واحدة (أي خطأ يلغي الكل) ومن غير احتفال. وقت الإدخال الأصلي وصاحبه يفضلان.
create or replace function public.lb_admin_update_deal(
  p_id uuid, p_agent_id uuid, p_date date, p_amount numeric,
  p_developer text default null, p_project text default null, p_team_id uuid default null,
  p_partner_id uuid default null, p_partner_team_id uuid default null, p_share_pct numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
declare
  v_old    leaderboard.deals%rowtype;
  v_amount numeric;
  v_events bigint;
  r        jsonb;
  v_new    uuid;
begin
  perform public.lb_require('deals');

  select * into v_old from leaderboard.deals where id = p_id;
  if not found then
    raise exception 'الصفقة غير موجودة' using errcode = '22023';
  end if;
  -- مبلغ الصفقة كله: النصيبان معاً لو مشتركة
  select sum(amount_egp) into v_amount from leaderboard.deals
  where id = p_id or (v_old.shared_id is not null and shared_id = v_old.shared_id);

  -- سطر واضح في سجل المستخدمين يتصدّر تفاصيل العملية
  insert into leaderboard.audit_log (user_id, actor, action, entity, label, details)
  values (
    auth.uid(), leaderboard.audit_user_label(auth.uid()), 'update', 'deals',
    (select name from leaderboard.agents where id = p_agent_id),
    jsonb_strip_nulls(jsonb_build_object(
      'changes', nullif(jsonb_strip_nulls(jsonb_build_object(
        'amount_egp', case when v_amount is distinct from p_amount then jsonb_build_array(v_amount, p_amount) end,
        'deal_date', case when v_old.deal_date is distinct from p_date then jsonb_build_array(v_old.deal_date, p_date) end,
        'agent_id', case when v_old.agent_id is distinct from p_agent_id then jsonb_build_array(v_old.agent_id, p_agent_id) end
      )), '{}'::jsonb),
      'ctx', jsonb_build_object('amount', p_amount, 'date', p_date)
    ))
  );

  select coalesce(max(id), 0) into v_events from leaderboard.sale_events;
  perform set_config('leaderboard.silent', 'on', true);

  perform public.lb_admin_delete_deal(p_id);
  r := public.lb_admin_add_deal(
    p_agent_id, p_date, p_amount, p_developer, p_project, p_team_id,
    p_partner_id, p_partner_team_id, p_share_pct
  );

  perform set_config('leaderboard.silent', 'off', true);
  -- الصفقة المشتركة تسجّل احتفالها صراحةً عند الإضافة — التعديل لا يحتفل
  delete from leaderboard.sale_events
  where id > v_events and kind = 'sale' and created_at = now()
    and agent_id in (p_agent_id, p_partner_id);

  v_new := (r ->> 'id')::uuid;
  update leaderboard.deals d
     set created_at = v_old.created_at, created_by = v_old.created_by
   where d.id = v_new
      or d.shared_id = (select shared_id from leaderboard.deals where id = v_new);

  return r || jsonb_build_object('celebrated', false);
end $function$;

revoke all on function public.lb_admin_update_deal(uuid, uuid, date, numeric, text, text, uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.lb_admin_update_deal(uuid, uuid, date, numeric, text, text, uuid, uuid, uuid, numeric) to authenticated, service_role;
