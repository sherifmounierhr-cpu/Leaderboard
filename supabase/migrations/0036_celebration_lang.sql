-- لغة الاحتفال على كل الشاشات: auto = لغة كل شاشة، أو عربي/إنجليزي إجباري
-- بغض النظر عن لغة اللوحة على الشاشة نفسها.

alter table leaderboard.board_settings
  add column if not exists celebration_lang text not null default 'auto'
  check (celebration_lang in ('auto', 'ar', 'en'));

create or replace view public.lb_board_settings
with (security_invoker = true) as
select
  celebration_seconds, celebration_song_id, volume, updated_at,
  cbe_deposit, cbe_lending, cbe_rates_at,
  news_enabled, news_slide_s, news_repeats, news_gap_min, news_chime, news_volume, news_sound_id,
  alerts_enabled, alert_email, alert_after_min,
  celebration_lang
from leaderboard.board_settings
where id = 1;

create or replace function public.lb_admin_set_celebration_lang(p_lang text)
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $$
begin
  perform public.lb_require('celebrate');
  if p_lang not in ('auto', 'ar', 'en') then
    raise exception 'لغة غير صالحة' using errcode = '22023';
  end if;
  update leaderboard.board_settings set celebration_lang = p_lang, updated_at = now() where id = 1;
end $$;

revoke all on function public.lb_admin_set_celebration_lang(text) from public, anon;
grant execute on function public.lb_admin_set_celebration_lang(text) to authenticated;
