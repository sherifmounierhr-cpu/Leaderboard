-- ضبط إجمالي مبيعات مستشار في ربع من صفحة «الصفقات».
-- الإجمالي لا يقل عن مجموع صفقاته المسجّلة في الربع (وإلا ناقض قائمة الصفقات)،
-- والفرق عن مجموع الصفقات يبقى «مبيعات غير مفصّلة» كما في ملف Excel. بلا احتفال.
-- ولا يُضبط ربع لم يبدأ بعد.
create or replace function public.lb_admin_set_total(
  p_agent_id uuid, p_year smallint, p_quarter smallint, p_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
declare
  v_today  date := (now() at time zone 'Africa/Cairo')::date;
  v_dsum   numeric;
  v_before numeric;
  v_total  numeric := round(p_total, 2);
begin
  perform public.lb_require('deals');

  if p_year is null or p_year < 2020 or p_year > 2100 or p_quarter is null or p_quarter not between 1 and 4 then
    raise exception 'الربع غير صالح' using errcode = '22023';
  end if;
  if p_year * 4 + p_quarter > extract(year from v_today)::int * 4 + extract(quarter from v_today)::int then
    raise exception 'هذا الربع لم يبدأ بعد' using errcode = '22023';
  end if;
  if not exists (select 1 from leaderboard.agents where id = p_agent_id) then
    raise exception 'المستشار غير موجود' using errcode = '22023';
  end if;
  if v_total is null or v_total < 0 then
    raise exception 'الإجمالي لا يكون سالباً' using errcode = '22023';
  end if;

  select coalesce(sum(amount_egp), 0) into v_dsum from leaderboard.deals
  where agent_id = p_agent_id and year = p_year and quarter = p_quarter;
  if v_total < v_dsum then
    raise exception '%', format(
      'الإجمالي أقل من مجموع الصفقات المسجّلة في الربع (%s). اكتب رقماً لا يقل عنه، أو عدّل الصفقات نفسها.', v_dsum
    ) using errcode = '22023';
  end if;

  select coalesce(sum(amount_egp), 0) into v_before from leaderboard.sales
  where agent_id = p_agent_id and year = p_year and quarter = p_quarter;

  perform set_config('leaderboard.silent', 'on', true);
  perform leaderboard.set_agent_sales(p_agent_id, p_year, p_quarter, v_total);
  perform set_config('leaderboard.silent', 'off', true);

  return jsonb_build_object('before', v_before, 'total', v_total, 'deals_sum', v_dsum);
end $function$;

revoke all on function public.lb_admin_set_total(uuid, smallint, smallint, numeric) from public, anon;
grant execute on function public.lb_admin_set_total(uuid, smallint, smallint, numeric) to authenticated, service_role;
