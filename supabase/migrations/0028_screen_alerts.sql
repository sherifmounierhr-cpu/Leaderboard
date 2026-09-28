-- ---------------------------------------------------------------------------
-- 0028 — إيميل لما شاشة تسكت.
--
-- تبويب «الأجهزة» بيعرض مين متصل، بس محدش بيبصّ عليه الساعة 3 الفجر. الشاشة
-- ممكن توقع بالليل وتفضل واقعة لحد ما حد يعدّي على المكتب الصبح.
--
-- «الشاشة» هنا مش أي جهاز: أي حد بيفتح البرنامج بيتسجّل، فلو بعتنا إيميل مع
-- كل تبويب بيتقفل، الإيميل ده هيتجاهل من تاني يوم. المسؤول بيعلّم بنفسه على
-- الشاشات اللي تستاهل متابعة، والتنبيه عليها هي بس.
-- ---------------------------------------------------------------------------

-- ==================================================================
-- 1. الأعمدة
-- ==================================================================
alter table leaderboard.devices
  -- تحت المتابعة: المسؤول علّم عليها بنفسه
  add column if not exists watch      boolean not null default false,
  -- وقت بعت تنبيه السكوت. مش null = التنبيه اتبعت وما اتكرّرش
  add column if not exists alerted_at timestamptz;

/*
 * المؤشر جزئي على الشاشات المتابَعة وحدها: الكرون بيسأل كل خمس دقايق، والسؤال
 * دايماً عن الشاشات دي بس، مهما كبر جدول الأجهزة بمتصفحات الناس.
 */
create index if not exists devices_watch_idx
  on leaderboard.devices (last_seen) where watch;

alter table leaderboard.board_settings
  add column if not exists alerts_enabled  boolean not null default true,
  add column if not exists alert_email     text
    check (alert_email is null or alert_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- أقل من 5 دقايق بيبقى إنذار كاذب: النبضة كل دقيقة وشبكة المكتب بتقطع
  add column if not exists alert_after_min smallint not null default 15
    check (alert_after_min between 5 and 240);

-- الأعمدة الجديدة في الآخر: create or replace مش بيسمح بإعادة ترتيب أعمدة view
create or replace view public.lb_board_settings with (security_invoker = true) as
select celebration_seconds, celebration_song_id, volume, updated_at,
       cbe_deposit, cbe_lending, cbe_rates_at,
       news_enabled, news_slide_s, news_repeats, news_gap_min,
       news_chime, news_volume, news_sound_id,
       alerts_enabled, alert_email, alert_after_min
from leaderboard.board_settings where id = 1;

create or replace view public.lb_devices with (security_invoker = true) as
select id, label, user_email, user_agent, screen, view, kiosk,
       first_seen, last_seen, revoked_at,
       watch, alerted_at
from leaderboard.devices;

revoke all on public.lb_devices from anon;
grant select on public.lb_devices to authenticated;

-- ==================================================================
-- 2. تحكّم المسؤول
-- ==================================================================
create or replace function public.lb_admin_set_device_watch(p_id uuid, p_watch boolean)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  perform public.lb_require('devices');

  update leaderboard.devices
     set watch = coalesce(p_watch, false),
         -- رفع المتابعة بيصفّي التنبيه المعلّق، فإعادتها بعدين تبدأ من نضيف
         alerted_at = case when coalesce(p_watch, false) then alerted_at else null end
   where id = p_id;

  if not found then
    raise exception 'الجهاز غير موجود' using errcode = '22023';
  end if;
end $$;

revoke all on function public.lb_admin_set_device_watch(uuid, boolean) from public, anon;
grant execute on function public.lb_admin_set_device_watch(uuid, boolean) to authenticated;

create or replace function public.lb_admin_save_alert_settings(
  p_enabled boolean, p_email text, p_after_min smallint
)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
  perform public.lb_require('devices');

  if coalesce(p_enabled, false) and v_email is null then
    raise exception 'اكتب بريد المتابعة قبل تشغيل التنبيه' using errcode = '22023';
  end if;

  update leaderboard.board_settings
     set alerts_enabled  = coalesce(p_enabled, false),
         alert_email     = lower(v_email),
         alert_after_min = coalesce(p_after_min, 15),
         updated_at      = now()
   where id = 1;
end $$;

revoke all on function public.lb_admin_save_alert_settings(boolean, text, smallint) from public, anon;
grant execute on function public.lb_admin_save_alert_settings(boolean, text, smallint) to authenticated;

-- ==================================================================
-- 3. مين يستاهل إيميل دلوقتي
-- ==================================================================
/*
 * بترجّع صفّين النوع: شاشة سكتت (`down`) وشاشة رجعت بعد ما بعتنا عنها
 * (`up`). الاتنين في دالة واحدة عشان الكرون يمشي مرّة واحدة ويقرا القرار
 * كامل بدل ما يسأل مرتين ويشوف حالتين مختلفتين بينهم.
 *
 * `stable` مش `volatile`: بتقرا وبس. الكتابة (`alerted_at`) بتحصل بعد ما
 * الإيميل يتبعت فعلاً، مش هنا — عشان فشل الإرسال ما يضيّعش التنبيه للأبد.
 */
create or replace function leaderboard.screen_alerts_due()
returns table (id uuid, label text, kind text, last_seen timestamptz, minutes integer)
language sql
stable
set search_path = leaderboard, public
as $$
  with cfg as (
    select alerts_enabled, alert_email, alert_after_min
    from leaderboard.board_settings where id = 1
  )
  select d.id,
         coalesce(nullif(btrim(d.label), ''), 'شاشة بدون اسم') as label,
         'down'::text as kind,
         d.last_seen,
         (extract(epoch from (now() - d.last_seen)) / 60)::integer as minutes
  from leaderboard.devices d, cfg
  where cfg.alerts_enabled
    and cfg.alert_email is not null
    and d.watch
    and d.revoked_at is null
    and d.alerted_at is null
    and d.last_seen < now() - make_interval(mins => cfg.alert_after_min)

  union all

  select d.id,
         coalesce(nullif(btrim(d.label), ''), 'شاشة بدون اسم'),
         'up',
         d.last_seen,
         0
  from leaderboard.devices d, cfg
  where cfg.alerts_enabled
    and cfg.alert_email is not null
    and d.watch
    and d.revoked_at is null
    and d.alerted_at is not null
    -- رجعت تنبض: النبضة كل دقيقة، فضِعفها يكفي للتأكد إنها فعلاً رجعت
    and d.last_seen > now() - interval '3 minutes';
$$;

revoke all on function leaderboard.screen_alerts_due() from public, anon, authenticated;

/** تُستدعى من الدالة بعد نجاح الإرسال، فالتنبيه ما يتكرّرش (ولا يضيع لو فشل). */
create or replace function leaderboard.mark_screen_alerted(p_ids uuid[], p_kind text)
returns integer
language plpgsql
security definer
set search_path = leaderboard, public
as $$
declare v_count integer;
begin
  update leaderboard.devices
     set alerted_at = case when p_kind = 'down' then now() else null end
   where id = any(coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function leaderboard.mark_screen_alerted(uuid[], text) from public, anon, authenticated;

-- ==================================================================
-- 4. واجهة دالة الحافة
-- ==================================================================
/*
 * schema `leaderboard` مش مكشوف عبر الـ API عن قصد، فدالة الحافة ما تقدرش
 * تنده حاجة جوّاه مباشرةً. الغلافين دول في `public` وصلاحية تنفيذهم
 * لـ`service_role` وحده — يعني مفتاح الخدمة، اللي عمره ما بيغادر الدالة.
 */
create or replace function public.lb_screen_alerts_due()
returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $$
declare v_email text;
begin
  select alert_email into v_email from leaderboard.board_settings where id = 1;
  return jsonb_build_object(
    'email', v_email,
    'rows', coalesce((select jsonb_agg(to_jsonb(t)) from leaderboard.screen_alerts_due() t), '[]'::jsonb)
  );
end $$;

revoke all on function public.lb_screen_alerts_due() from public, anon, authenticated;
grant execute on function public.lb_screen_alerts_due() to service_role;

create or replace function public.lb_mark_screen_alerted(p_ids uuid[], p_kind text)
returns integer
language plpgsql
security definer
set search_path = leaderboard, public
as $$
begin
  if p_kind not in ('down', 'up') then
    raise exception 'نوع تنبيه غير معروف: %', p_kind using errcode = '22023';
  end if;
  return leaderboard.mark_screen_alerted(p_ids, p_kind);
end $$;

revoke all on function public.lb_mark_screen_alerted(uuid[], text) from public, anon, authenticated;
grant execute on function public.lb_mark_screen_alerted(uuid[], text) to service_role;

-- ==================================================================
-- 5. الاستدعاء من الكرون
-- ==================================================================
create extension if not exists pg_net with schema extensions;

/*
 * نفس نمط `trigger_sync` في 0003: السرّ من Vault، فما بيظهرش في أي مكان
 * خارج القاعدة، ومفتاح Resend نفسه عمره ما بيدخل القاعدة أصلاً — هو في
 * أسرار الدالة وحدها.
 */
create or replace function leaderboard.trigger_screen_alerts()
returns bigint
language plpgsql
security definer
set search_path = leaderboard, public, extensions
as $fn$
declare
  v_base   text;
  v_secret text;
  v_id     bigint;
begin
  -- مفيش حاجة تستاهل نداء: ما نصحّيش الدالة كل خمس دقايق على الفاضي
  if not exists (select 1 from leaderboard.screen_alerts_due()) then
    return null;
  end if;

  select decrypted_secret into v_base   from vault.decrypted_secrets where name = 'lb_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'lb_alert_secret';

  if v_base is null or v_secret is null then
    raise exception 'lb_functions_url أو lb_alert_secret غير موجود في Vault';
  end if;

  select net.http_post(
    url     := v_base || '/screen-alert',
    headers := jsonb_build_object('content-type', 'application/json', 'x-alert-secret', v_secret),
    body    := '{}'::jsonb
  ) into v_id;

  return v_id;
end $fn$;

revoke all on function leaderboard.trigger_screen_alerts() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'lb-screen-alerts';

/*
 * كل خمس دقايق. أقل من كده ما بيقدّمش حاجة — أقل عتبة مسموحة 5 دقايق —
 * وأكتر بيخلّي «سكتت من 15 دقيقة» توصل بعد نص ساعة.
 */
select cron.schedule(
  'lb-screen-alerts',
  '*/5 * * * *',
  $cron$ select leaderboard.trigger_screen_alerts(); $cron$
);
