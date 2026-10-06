-- سجل المستخدمين: تغيير بريد حساب (من دالة الحافة admin-users، بمفتاح الخدمة، فلا يلتقطه trigger).
-- تعديل نصّي على الدالة كما هي في القاعدة.
do $$
declare
  v_oid oid := 'public.lb_admin_log_user_action(text, uuid)'::regprocedure;
  def   text := pg_get_functiondef(v_oid);
  a1 constant text := '''user_create'', ''user_password'',';
  fixed text;
begin
  if position('user_email' in def) > 0 then return; end if;
  if position(a1 in def) = 0 then
    raise exception 'lb_admin_log_user_action: لم يُعثر على موضع التعديل';
  end if;
  fixed := replace(def, a1, '''user_create'', ''user_email'', ''user_password'',');
  execute fixed;
end $$;
