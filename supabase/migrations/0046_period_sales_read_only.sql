-- المبيعات لا تُعدَّل من صفحة «الأهداف والمبيعات»: تتسجّل من «الصفقات» (أو رفع Excel).
-- الصفحة تحفظ الهدف فقط. المعامل p_deals يبقى في التوقيع للتوافق لكنه يُتجاهل،
-- فلا يقدر أي نداء مباشر على تغيير المبيعات من هذه الدالة.
--
-- تعديل نصّي على الدالة كما هي في القاعدة — بدون إعادة كتابة جسمها.
do $$
declare
  v_oid oid := 'public.lb_admin_save_period(uuid, smallint, smallint, numeric, numeric)'::regprocedure;
  def   text := pg_get_functiondef(v_oid);
  a1 constant text := E'  perform leaderboard.set_agent_sales(p_agent_id, p_year, p_quarter, p_deals);\n';
  fixed text;
begin
  if position(a1 in def) = 0 then
    if position('المبيعات لا تُعدَّل' in def) > 0 then return; end if;
    raise exception 'lb_admin_save_period: لم يُعثر على موضع التعديل';
  end if;
  fixed := replace(def, a1, E'  -- المبيعات للقراءة فقط هنا: تتسجّل من الصفقات (p_deals يُتجاهل)\n');
  execute fixed;
end $$;
