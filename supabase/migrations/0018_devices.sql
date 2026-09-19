-- ==================================================================
-- سجل الأجهزة: كل شاشة أو متصفح فاتح البرنامج يسجّل نفسه كل دقيقة،
-- فالمسؤول يشوف مين متصل ويقدر يقطع اتصال أي جهاز.
--
-- «قطع الاتصال» على مستويين:
--   1. علامة revoked_at — الجهاز يشوفها خلال دقيقة ويخرج من الحساب فوراً.
--   2. حذف جلسة auth الخاصة به، فالتوكن ما يتجددش حتى لو الصفحة فضلت مفتوحة.
-- ==================================================================

create table if not exists leaderboard.devices (
  id          uuid primary key,
  label       text check (label is null or char_length(label) <= 60),
  user_id     uuid references auth.users (id) on delete set null,
  user_email  text,
  user_agent  text,
  screen      text,
  view        text,
  kiosk       boolean not null default false,
  session_id  uuid,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references auth.users (id) on delete set null
);
create index if not exists devices_last_seen_idx on leaderboard.devices (last_seen desc);

alter table leaderboard.devices enable row level security;
drop policy if exists lb_devices_read on leaderboard.devices;
-- سجل الأجهزة فيه بريد وجهاز كل مستخدم: للمسؤول وحساب العرض فقط
create policy lb_devices_read on leaderboard.devices
  for select to authenticated using (public.is_admin() or public.lb_is_demo());
revoke all on leaderboard.devices from anon;
grant select on leaderboard.devices to authenticated;

create or replace view public.lb_devices with (security_invoker = true) as
select id, label, user_email, user_agent, screen, view, kiosk,
       first_seen, last_seen, revoked_at
from leaderboard.devices;

revoke all on public.lb_devices from anon;
grant select on public.lb_devices to authenticated;

-- ------------------------------------------------------------ نبضة الجهاز
-- أي مستخدم مسجَّل يسجّل جهازه هو. الرد يقول للجهاز إن كان اتقطع.
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
    -- الاسم اللي كتبه المسؤول يفضل؛ الباقي يتحدّث مع كل نبضة
    label      = coalesce(d.label, excluded.label),
    user_id    = excluded.user_id,
    user_email = excluded.user_email,
    user_agent = excluded.user_agent,
    screen     = excluded.screen,
    view       = excluded.view,
    kiosk      = excluded.kiosk,
    session_id = excluded.session_id,
    last_seen  = now()
  returning d.revoked_at into v_revoked;

  return v_revoked is not null;
end $$;

-- ------------------------------------------------------------ قطع الاتصال
create or replace function public.lb_admin_revoke_device(p_id uuid)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_session uuid;
begin
  perform public.lb_admin_guard();
  update leaderboard.devices
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_id
  returning session_id into v_session;

  -- حذف جلسة auth يمنع تجديد التوكن، فالجهاز ما يرجعش لوحده
  if v_session is not null then
    delete from auth.sessions where id = v_session;
  end if;
end $$;

-- الجهاز اللي اتقطع يقدر يرجع بتسجيل دخول جديد: المسؤول يشيل العلامة
create or replace function public.lb_admin_restore_device(p_id uuid)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  update leaderboard.devices set revoked_at = null, revoked_by = null where id = p_id;
end $$;

create or replace function public.lb_admin_rename_device(p_id uuid, p_label text)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  update leaderboard.devices set label = nullif(btrim(p_label), '') where id = p_id;
end $$;

create or replace function public.lb_admin_delete_device(p_id uuid)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_admin_guard();
  delete from leaderboard.devices where id = p_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lb_device_ping(uuid, text, text, text, text, boolean, uuid)',
    'public.lb_admin_revoke_device(uuid)',
    'public.lb_admin_restore_device(uuid)',
    'public.lb_admin_rename_device(uuid, text)',
    'public.lb_admin_delete_device(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = 'devices'
     ) then
    execute 'alter publication supabase_realtime add table leaderboard.devices';
  end if;
end $$;
