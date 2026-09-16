-- ==================================================================
-- لقطة يومية تلقائية: تغذّي رسم الاتجاه وأسهم تغيّر الترتيب.
--
-- 20:50 UTC = 23:50 القاهرة صيفاً و22:50 شتاءً. في الحالتين تاريخ UTC
-- (الذي تستخدمه take_snapshot عبر current_date) هو نفس تاريخ القاهرة.
-- الربع يُحسب بتوقيت القاهرة حتى لا تُسجَّل ليلة 30 سبتمبر على الربع التالي.
-- ==================================================================
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'lb-daily-snapshot';

select cron.schedule(
  'lb-daily-snapshot',
  '50 20 * * *',
  $cron$
    select leaderboard.take_snapshot(
      extract(year from now() at time zone 'Africa/Cairo')::smallint,
      extract(quarter from now() at time zone 'Africa/Cairo')::smallint
    );
  $cron$
);
