-- استيراد Excel من صفحة الإدارة.
--
-- المنطق نفسه الموجود في public.lb_sync المستخدَم مع جوجل شيت: إدراج وتحديث
-- بالاسم فقط، بلا أي حذف — فملف ناقص لا يمحو أحداً. نكتفي بغلاف محروس بدل
-- تكرار المنطق، حتى لا يتفرّع مسارا الاستيراد عن بعضهما مع الوقت.
--
-- lb_sync ممنوحة لـ service_role فقط، وهذا الغلاف SECURITY DEFINER بنفس
-- المالك فينفّذها نيابةً عن المسؤول بعد التحقق منه.

create or replace function public.lb_admin_import(p_year smallint, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lb_admin_guard();

  if p_year is null or p_year < 2020 or p_year > 2100 then
    raise exception 'سنة غير صالحة' using errcode = '22023';
  end if;

  return public.lb_sync(p_year, p_payload);
end $$;

revoke all on function public.lb_admin_import(smallint, jsonb) from public, anon;
grant execute on function public.lb_admin_import(smallint, jsonb) to authenticated;
