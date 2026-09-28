-- ==================================================================
-- إصلاح أمني: lb_device_ping كان يقبل أي p_id من العميل ويعمل upsert،
-- فأي مستخدم مسجَّل يعرف UUID جهاز غيره (ظاهر في قائمة الأجهزة للمسؤول)
-- كان يقدر يكتب فوق user_id / user_email / session_id بتاعه.
--
-- دلوقتي الصف الموجود بيتحدّث فقط لو:
--   • الجهاز تابع لنفس المستخدم، أو
--   • ماله مستخدم، أو
--   • جلسته القديمة ما بقتش موجودة في auth.sessions (خروج أو قطع اتصال)
--     — ده يحافظ على حالة الشاشة المشتركة اللي بيدخل عليها مستخدم تاني.
-- غير كده النبضة تتجاهل بدون تعديل وترجع false.
-- ==================================================================

create or replace function public.lb_device_ping(
  p_id uuid, p_label text, p_agent text, p_screen text, p_view text,
  p_kiosk boolean, p_session uuid
)
returns boolean
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_revoked timestamptz;
begin
  if auth.uid() is null then
    raise exception 'غير مسجَّل' using errcode = '42501';
  end if;

  insert into leaderboard.devices as d
    (id, label, user_id, user_email, user_agent, screen, view, kiosk, session_id)
  values
    (p_id, nullif(btrim(p_label), ''), auth.uid(), lower(auth.jwt() ->> 'email'),
     left(coalesce(p_agent, ''), 300), left(coalesce(p_screen, ''), 40),
     left(coalesce(p_view, ''), 20), coalesce(p_kiosk, false), p_session)
  on conflict (id) do update set
    label      = coalesce(d.label, excluded.label),
    user_id    = excluded.user_id,
    user_email = excluded.user_email,
    user_agent = excluded.user_agent,
    screen     = excluded.screen,
    view       = excluded.view,
    kiosk      = excluded.kiosk,
    session_id = excluded.session_id,
    last_seen  = now()
  where d.user_id is null
     or d.user_id = auth.uid()
     or d.session_id is null
     or not exists (select 1 from auth.sessions s where s.id = d.session_id)
  returning d.revoked_at into v_revoked;

  return v_revoked is not null;
end $$;

revoke all on function public.lb_device_ping(uuid, text, text, text, text, boolean, uuid)
  from public, anon;
grant execute on function public.lb_device_ping(uuid, text, text, text, text, boolean, uuid)
  to authenticated;
