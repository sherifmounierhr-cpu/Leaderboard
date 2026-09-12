-- سباكة استدعاء المزامنة من داخل قاعدة البيانات.
-- الجدولة نفسها في 0005 — تُطبَّق بعد نجاح أول مزامنة يدوية، وإلا فشلت كل
-- خمس دقائق وملأت السجل بالأخطاء.
--
-- قبل التطبيق خزّن السرّين في Vault (لوحة Supabase ← Settings ← Vault، أو SQL):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'lb_functions_url');
--   select vault.create_secret('<SYNC_SECRET>', 'lb_sync_secret');

create extension if not exists pg_cron with schema cron;
create extension if not exists pg_net with schema extensions;

/**
 * تستدعي Edge Function ومعها ترويسة السرّ المقروءة من Vault.
 * فائدتها أن السرّ لا يظهر في أي مكان خارج القاعدة: من يشغّل المزامنة لا
 * يحتاج معرفته.
 */
create or replace function leaderboard.trigger_sync(p_snapshot boolean default false)
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
  select decrypted_secret into v_base   from vault.decrypted_secrets where name = 'lb_functions_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'lb_sync_secret';

  if v_base is null then
    raise exception 'lb_functions_url غير موجود في Vault';
  end if;
  if v_secret is null then
    raise exception 'lb_sync_secret غير موجود في Vault';
  end if;

  select net.http_post(
    url     := v_base || '/sheets-sync' || case when p_snapshot then '?snapshot=1' else '' end,
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-secret', v_secret),
    body    := '{}'::jsonb
  ) into v_id;

  return v_id;
end $fn$;

revoke all on function leaderboard.trigger_sync(boolean) from public, anon, authenticated;
