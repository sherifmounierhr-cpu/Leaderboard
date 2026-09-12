-- جدولة المزامنة. تُطبَّق بعد نجاح أول مزامنة يدوية فقط.

-- مزامنة كل 5 دقائق
select cron.schedule(
  'lb-sheets-sync',
  '*/5 * * * *',
  $cron$ select leaderboard.trigger_sync(false); $cron$
);

-- لقطة يومية 23:55 UTC (= 01:55 بتوقيت القاهرة صيفاً) — هي ما يغذّي
-- أسهم الترتيب ورسم الاتجاه، فلا يظهران قبل مرور يومين على الأقل.
select cron.schedule(
  'lb-daily-snapshot',
  '55 23 * * *',
  $cron$ select leaderboard.trigger_sync(true); $cron$
);

-- للإلغاء:
--   select cron.unschedule('lb-sheets-sync');
--   select cron.unschedule('lb-daily-snapshot');
