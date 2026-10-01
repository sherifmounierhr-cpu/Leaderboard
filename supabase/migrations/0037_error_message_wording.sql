-- توحيد صياغة رسائل الخطأ: «الفريق» بدل «الفرع»، وفصحى بدل «لازم يكون».
-- استبدال نصّي داخل تعريف كل دالة كما هو في القاعدة — بدون إعادة كتابة
-- جسم الدوال (lb_admin_import كبيرة، وإعادة كتابتها يدوياً سبق وسبّبت تراجعاً).
do $$
declare
  f record;
  def text;
  fixed text;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('lb_admin_save_team', 'lb_admin_add_deal', 'lb_admin_import')
  loop
    def := pg_get_functiondef(f.oid);
    fixed := def;
    fixed := replace(fixed, 'اسم الفرع مطلوب', 'اسم الفريق مطلوب');
    fixed := replace(fixed, 'الفرع غير موجود', 'الفريق غير موجود');
    fixed := replace(fixed, 'مبلغ الصفقة لازم يكون أكبر من صفر', 'مبلغ الصفقة يجب أن يكون أكبر من صفر');
    fixed := replace(fixed, 'المبلغ لازم يكون أكبر من صفر', 'المبلغ يجب أن يكون أكبر من صفر');
    if fixed <> def then
      execute fixed;
    end if;
  end loop;
end $$;
