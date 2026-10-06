-- تعديل إجمالي مبيعات الربع من ملف Excel.
--
-- الملف المصدَّر صار فيه q1_total … q4_total (إجمالي الربع كما على اللوحة). الواجهة
-- ترسل «total» لفترة المستشار فقط لو الرقم في الملف يختلف عن الموجود في اللوحة،
-- فالملف بلا تعديل لا يغيّر شيئاً. وجود total = الإجمالي يُضبط على هذا الرقم
-- بالضبط (يتقدّم على q_deals + الصفقات). ويُرفض لو أقل من مجموع صفقات الربع
-- المسجّلة، لأن الإجمالي حينها يناقض قائمة الصفقات.
--
-- تعديل نصّي على الدالة كما هي في القاعدة — بدون إعادة كتابة جسمها.
do $$
declare
  v_oid oid := 'public.lb_admin_import(smallint, jsonb)'::regprocedure;
  def   text := pg_get_functiondef(v_oid);
  d0 constant text := E'  v_updated integer := 0;\n';
  s1 constant text := E'           coalesce((p->>''deals'')::numeric, 0) as extra\n';
  s2 constant text := E'  loop\n    -- إجمالي صفقات نفس المستشار ونفس الربع في ملف الرفع نفسه';
  s3 constant text := 'jsonb_build_object(''deals_updated'', v_updated)';
  fixed text;
begin
  if position('v_totals' in def) > 0 then
    return; -- مطبَّق بالفعل
  end if;
  if position(d0 in def) = 0 or position(s1 in def) = 0 or position(s2 in def) = 0 or position(s3 in def) = 0 then
    raise exception 'lb_admin_import: لم يُعثر على موضع التعديل';
  end if;

  fixed := replace(def, d0, d0 || E'  v_totals  integer := 0;\n  v_dsum    numeric;\n');

  fixed := replace(fixed, s1,
    E'           coalesce((p->>''deals'')::numeric, 0) as extra,\n'
    || E'           nullif(btrim(coalesce(p->>''total'', '''')), '''')::numeric as total\n');

  fixed := replace(fixed, s2, $block$  loop
    -- إجمالي الربع مكتوب صراحةً في الملف: يُضبط عليه بالضبط
    if r.total is not null then
      if r.total < 0 then
        raise exception 'ورقة Agents: إجمالي q% للمستشار «%» لا يكون سالباً', r.quarter, r.agent_name
          using errcode = '22023';
      end if;
      select coalesce(sum(amount_egp), 0) into v_dsum from leaderboard.deals
      where agent_id = r.agent_id and year = p_year and quarter = r.quarter;
      if round(r.total, 2) < v_dsum then
        raise exception '%', format(
          'ورقة Agents: إجمالي q%s للمستشار «%s» = %s، وهو أقل من مجموع صفقاته المسجّلة في الربع (%s). اكتب رقماً لا يقل عن مجموع الصفقات، أو عدّل الصفقات نفسها من ورقة Deals.',
          r.quarter, r.agent_name, r.total, v_dsum
        ) using errcode = '22023';
      end if;
      perform leaderboard.set_agent_sales(r.agent_id, p_year, r.quarter, r.total);
      v_totals := v_totals + 1;
      continue;
    end if;

    -- إجمالي صفقات نفس المستشار ونفس الربع في ملف الرفع نفسه$block$);

  fixed := replace(fixed, s3, s3 || ' || jsonb_build_object(''totals_set'', v_totals)');
  execute fixed;
end $$;
