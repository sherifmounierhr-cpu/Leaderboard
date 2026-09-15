-- دور المستخدم الحالي للواجهة في استدعاء واحد.
--
-- الواجهة كانت تقرأ public.profiles من تطبيق الموارد البشرية. هذه القراءة
-- لعرض الشاشة الصحيحة فقط؛ الصلاحية الفعلية تُفرض داخل lb_admin_guard.
-- العرض يسبق المسؤول: حساب عرض رُقّي بالخطأ يبقى للاطلاع فقط.

create or replace function public.lb_role()
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when public.lb_is_demo() then 'demo'
    when public.is_admin()   then 'admin'
    else 'viewer'
  end;
$fn$;

revoke all on function public.lb_role() from public, anon;
grant execute on function public.lb_role() to authenticated;
