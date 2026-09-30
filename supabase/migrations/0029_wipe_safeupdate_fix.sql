-- lb_admin_wipe كان بيمسح بدون شرط WHERE، وده بيتصادم مع إضافة safeupdate
-- المفعّلة على اتصال authenticator (تمنع أي DELETE/UPDATE بلا WHERE، حتى
-- داخل دالة SECURITY DEFINER). الإضافة "where true" بتحافظ على نفس
-- المنطق تماماً وبتحقق شرط الحماية.

create or replace function public.lb_admin_wipe(p_scope text, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_counts jsonb;
begin
  perform public.lb_require('data');
  if not public.is_admin() then
    raise exception 'مسح البيانات للمسؤول الكامل فقط' using errcode = '42501';
  end if;
  if p_scope not in ('sales', 'all') then
    raise exception 'نطاق مسح غير معروف' using errcode = '22023';
  end if;
  if coalesce(btrim(p_confirm), '') not in ('مسح', 'DELETE') then
    raise exception 'كلمة التأكيد غير صحيحة — لم يُمسح شيء' using errcode = '22023';
  end if;

  perform set_config('leaderboard.silent', 'on', true);

  v_counts := jsonb_build_object(
    'deals',     (select count(*) from leaderboard.deals),
    'sales',     (select count(*) from leaderboard.sales),
    'targets',   (select count(*) from leaderboard.targets),
    'events',    (select count(*) from leaderboard.sale_events),
    'snapshots', (select count(*) from leaderboard.snapshots),
    'agents',    case when p_scope = 'all' then (select count(*) from leaderboard.agents) else 0 end,
    'teams',     case when p_scope = 'all' then (select count(*) from leaderboard.teams) else 0 end
  );

  delete from leaderboard.deals where true;
  delete from leaderboard.sale_events where true;
  delete from leaderboard.sales where true;
  delete from leaderboard.targets where true;
  delete from leaderboard.snapshots where true;

  if p_scope = 'all' then
    delete from leaderboard.team_leads where true;
    delete from leaderboard.agents where true;
    delete from leaderboard.teams where true;
  end if;

  insert into leaderboard.maintenance_log (kind, details)
  values ('wipe', v_counts || jsonb_build_object('scope', p_scope));

  return v_counts;
end $fn$;

revoke all on function public.lb_admin_wipe(text, text) from public, anon;
grant execute on function public.lb_admin_wipe(text, text) to authenticated;
