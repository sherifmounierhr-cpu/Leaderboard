-- ---------------------------------------------------------------------------
-- 0019 — أسعار فائدة البنك المركزي المصري على شاشة الأسواق.
--
-- ليه في قاعدة البيانات مش من الإنترنت: موقع البنك المركزي بيرفض أي طلب
-- آلي (جدار حماية)، ومفيش مصدر مجاني موثوق لسعر الكوريدور المصري. الأسعار
-- بتتغيّر في اجتماعات لجنة السياسة النقدية (٨ مرات في السنة تقريباً)، فالمسؤول
-- بيدخّلها مرة بعد كل اجتماع، والشاشة بتعرض تاريخ آخر تحديث جنبها.
--
-- سعر الفائدة الفيدرالي الأمريكي بييجي مباشرةً من FRED في /api/markets.
-- ---------------------------------------------------------------------------

alter table leaderboard.board_settings
  add column if not exists cbe_deposit  numeric(5,2) check (cbe_deposit between 0 and 60),
  add column if not exists cbe_lending  numeric(5,2) check (cbe_lending between 0 and 60),
  add column if not exists cbe_rates_at date;

-- الأعمدة الجديدة تتضاف في الآخر: create or replace مش بيسمح بإعادة ترتيب
-- أعمدة view موجود، وبيرفض الاستبدال برسالة «cannot change name of view column».
create or replace view public.lb_board_settings with (security_invoker = true) as
select celebration_seconds, celebration_song_id, volume, updated_at,
       cbe_deposit, cbe_lending, cbe_rates_at
from leaderboard.board_settings where id = 1;

/*
 * دالة مستقلة عن lb_admin_save_board_settings: إعدادات الاحتفال بتتحفظ من
 * شاشة تانية، وخلط الاتنين كان هيخلّي أي حفظ يمسح بيانات الشاشة التانية.
 */
create or replace function public.lb_admin_save_cbe_rates(
  p_deposit numeric, p_lending numeric, p_at date
)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();

  if p_deposit is not null and p_lending is not null and p_lending < p_deposit then
    raise exception 'سعر الإقراض لا يقل عن سعر الإيداع' using errcode = '22023';
  end if;
  if p_at is not null and p_at > current_date then
    raise exception 'تاريخ القرار في المستقبل' using errcode = '22023';
  end if;

  update leaderboard.board_settings
     set cbe_deposit = p_deposit,
         cbe_lending = p_lending,
         cbe_rates_at = p_at,
         updated_at = now()
   where id = 1;
end $$;

revoke all on function public.lb_admin_save_cbe_rates(numeric, numeric, date) from public, anon;
grant execute on function public.lb_admin_save_cbe_rates(numeric, numeric, date) to authenticated;
