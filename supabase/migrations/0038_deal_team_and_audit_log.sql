-- 1) الصفقة تُسجَّل لفريق يختاره المُدخِل (الافتراضي فريق المستشار الحالي).
-- 2) سجل المستخدمين: مَن دخل لوحة الإدارة، ومَن أضاف أو عدّل أو حذف ماذا.

-- ───────────────────────── الصفقة وفريقها ─────────────────────────
drop function if exists public.lb_admin_add_deal(uuid, date, numeric, text, text);

create or replace function public.lb_admin_add_deal(
  p_agent_id uuid, p_date date, p_amount numeric,
  p_developer text default null, p_project text default null, p_team_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
declare
  v_team  uuid;
  v_year  smallint := extract(year from p_date)::smallint;
  v_q     smallint := extract(quarter from p_date)::smallint;
  v_today date     := (now() at time zone 'Africa/Cairo')::date;
  v_id    uuid;
  v_total numeric;
  v_dev   text := nullif(btrim(coalesce(p_developer, '')), '');
  v_proj  text := nullif(btrim(coalesce(p_project, '')), '');
begin
  perform public.lb_require('deals');

  if p_amount is null or p_amount <= 0 then
    raise exception 'مبلغ الصفقة يجب أن يكون أكبر من صفر' using errcode = '22023';
  end if;
  if p_date is null or p_date > v_today then
    raise exception 'تاريخ الصفقة لا يكون في المستقبل' using errcode = '22023';
  end if;
  if p_date < v_today - interval '3 years' then
    raise exception 'تاريخ الصفقة قديم جداً' using errcode = '22023';
  end if;

  select team_id into v_team from leaderboard.agents where id = p_agent_id;
  if not found then
    raise exception 'المستشار غير موجود' using errcode = '22023';
  end if;

  -- الفريق المختار يغلب فريق المستشار الحالي (لو اتنقل، أو باع لفريق تاني)
  if p_team_id is not null then
    if not exists (select 1 from leaderboard.teams where id = p_team_id) then
      raise exception 'الفريق غير موجود' using errcode = '22023';
    end if;
    v_team := p_team_id;
  end if;

  insert into leaderboard.deals (agent_id, team_id, deal_date, amount_egp, developer, project, created_by)
  values (p_agent_id, v_team, p_date, p_amount, left(v_dev, 80), left(v_proj, 80), auth.uid())
  returning id into v_id;

  insert into leaderboard.sales (agent_id, year, quarter, amount_egp, team_id)
  values (p_agent_id, v_year, v_q, p_amount, v_team)
  on conflict (agent_id, year, quarter, team_id)
  do update set amount_egp = leaderboard.sales.amount_egp + excluded.amount_egp;

  select coalesce(sum(amount_egp), 0) into v_total
  from leaderboard.sales where agent_id = p_agent_id and year = v_year and quarter = v_q;

  return jsonb_build_object(
    'id', v_id, 'year', v_year, 'quarter', v_q, 'total_egp', v_total,
    'celebrated', v_year = extract(year from v_today)::smallint
                  and v_q = extract(quarter from v_today)::smallint
  );
end $function$;

revoke all on function public.lb_admin_add_deal(uuid, date, numeric, text, text, uuid) from public, anon;
grant execute on function public.lb_admin_add_deal(uuid, date, numeric, text, text, uuid) to authenticated, service_role;

-- ───────────────────────── سجل المستخدمين ─────────────────────────
create table if not exists leaderboard.audit_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid,
  -- الاسم وقت الحدث: يفضل مقروءاً حتى لو اتحذف الحساب بعدها
  actor   text,
  action  text not null,
  entity  text,
  label   text,
  details jsonb,
  -- كل ما حصل في عملية واحدة (استيراد ملف مثلاً) يتجمّع في سطر واحد
  txid    bigint not null default txid_current()
);
create index if not exists audit_log_txid_idx on leaderboard.audit_log (txid);
create index if not exists audit_log_user_idx on leaderboard.audit_log (user_id, id desc);
alter table leaderboard.audit_log enable row level security;
revoke all on leaderboard.audit_log from public, anon, authenticated;

create or replace function leaderboard.audit_user_label(p_user uuid)
returns text
language sql
stable
security definer
set search_path to 'leaderboard', 'public'
as $function$
  select coalesce(
    n.username,
    case when u.email like '%@noemail.everest-leaderboard.app' then null else u.email::text end
  )
  from auth.users u
  left join leaderboard.usernames n on n.user_id = u.id
  where u.id = p_user;
$function$;
revoke all on function leaderboard.audit_user_label(uuid) from public, anon, authenticated;

create or replace function leaderboard.audit_row()
returns trigger
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_tbl     text := tg_table_name;
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changes jsonb;
  v_label   text;
  v_ctx     jsonb;
  -- أعمدة تتغيّر لوحدها ولا تعني أن حد عدّل حاجة
  c_noise constant text[] := array[
    'updated_at', 'updated_by', 'created_at', 'created_by', 'last_seen', 'first_seen',
    'session_id', 'user_agent', 'screen', 'view', 'kiosk', 'user_email', 'user_id',
    'alerted_at', 'hidden_at', 'hidden_by', 'revoked_by', 'failed_count', 'locked_until'
  ];
begin
  -- بلا مستخدم = مزامنة أو مهمة مجدولة، مش تعديل من حد
  if v_uid is null then return null; end if;

  -- السجل لا يوقف الشغل أبداً: أي خطأ فيه يتبلع والتعديل الأصلي يكمل
  begin
    if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
    v_row := coalesce(v_new, v_old);

    -- أول اتصال لشاشة مش تعديل
    if v_tbl = 'devices' and tg_op = 'INSERT' then return null; end if;
    -- الاحتفال التلقائي بالصفقة وبطاقات احتفال الربع: الصفقة والمقدمة مسجَّلتان بالفعل
    if v_tbl = 'sale_events' and (tg_op <> 'INSERT' or v_row ->> 'kind' in ('sale', 'quarter')) then
      return null;
    end if;
    -- إجمالي الربع بيتحرك مع كل صفقة؛ الصفقة نفسها هي السطر المهم
    if v_tbl = 'sales' and exists (
      select 1 from leaderboard.audit_log where txid = txid_current() and entity = 'deals'
    ) then
      return null;
    end if;
    if (select count(*) from leaderboard.audit_log where txid = txid_current()) >= 400 then
      return null;
    end if;

    if tg_op = 'UPDATE' then
      select jsonb_object_agg(n.key, jsonb_build_array(o.value, n.value)) into v_changes
      from jsonb_each(v_new) n
      join jsonb_each(v_old) o on o.key = n.key
      where n.value is distinct from o.value and n.key <> all (c_noise);
      if v_changes is null then return null; end if;
    end if;

    v_label := coalesce(
      case when v_tbl = 'usernames' then v_row ->> 'username' end,
      nullif(v_row ->> 'name', ''),
      nullif(v_row ->> 'title', ''),
      nullif(v_row ->> 'label', ''),
      (select name from leaderboard.agents where id = (v_row ->> 'agent_id')::uuid),
      (select name from leaderboard.teams where id = (v_row ->> 'team_id')::uuid),
      case when v_row ? 'user_id' then leaderboard.audit_user_label((v_row ->> 'user_id')::uuid) end
    );

    v_ctx := jsonb_strip_nulls(jsonb_build_object(
      'year', v_row -> 'year',
      'quarter', v_row -> 'quarter',
      'amount', v_row -> 'amount_egp',
      'target', v_row -> 'target_egp',
      'date', v_row -> 'deal_date',
      'project', v_row -> 'project',
      'developer', v_row -> 'developer',
      'role', v_row -> 'role',
      'permissions', v_row -> 'permissions',
      'team', (select to_jsonb(name) from leaderboard.teams where id = (v_row ->> 'team_id')::uuid)
    ));

    insert into leaderboard.audit_log (user_id, actor, action, entity, label, details)
    values (
      v_uid, leaderboard.audit_user_label(v_uid), lower(tg_op), v_tbl, left(v_label, 200),
      jsonb_strip_nulls(jsonb_build_object('changes', v_changes, 'ctx', nullif(v_ctx, '{}'::jsonb)))
    );
  exception when others then
    null;
  end;
  return null;
end $function$;
revoke all on function leaderboard.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'agents', 'teams', 'team_leads', 'deals', 'sales', 'targets', 'announcements',
    'board_settings', 'directors', 'media_files', 'news_casts', 'news_hidden',
    'user_access', 'usernames', 'admins', 'devices', 'sale_events', 'celebration_intros'
  ]
  loop
    execute format('drop trigger if exists audit_row on leaderboard.%I', t);
    execute format(
      'create trigger audit_row after insert or update or delete on leaderboard.%I '
      'for each row execute function leaderboard.audit_row()', t);
  end loop;
end $$;

-- دخول لوحة الإدارة: نداء من الصفحة بعد ثبوت الصلاحية، مرة كل نصف ساعة على الأكثر
create or replace function public.lb_log_admin_visit()
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.lb_can_view_admin() then return; end if;
  if exists (
    select 1 from leaderboard.audit_log
    where user_id = v_uid and action = 'login' and at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  insert into leaderboard.audit_log (user_id, actor, action)
  values (v_uid, leaderboard.audit_user_label(v_uid), 'login');
  delete from leaderboard.audit_log where at < now() - interval '400 days';
end $function$;
revoke all on function public.lb_log_admin_visit() from public, anon;
grant execute on function public.lb_log_admin_visit() to authenticated;

-- عمليات الحسابات نفسها (إنشاء، كلمة مرور، إيقاف، حذف) تتم بمفتاح الخدمة في
-- دالة الحافة admin-users، فلا يراها أي trigger — الدالة تسجّلها من هنا بتوكن المسؤول.
create or replace function public.lb_admin_log_user_action(p_action text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
begin
  perform public.lb_require('users');
  if p_action not in ('user_create', 'user_password', 'user_ban', 'user_unban', 'user_delete') then
    raise exception 'إجراء غير معروف' using errcode = '22023';
  end if;
  insert into leaderboard.audit_log (user_id, actor, action, entity, label)
  values (auth.uid(), leaderboard.audit_user_label(auth.uid()), p_action, 'users',
          leaderboard.audit_user_label(p_user_id));
end $function$;
revoke all on function public.lb_admin_log_user_action(text, uuid) from public, anon;
grant execute on function public.lb_admin_log_user_action(text, uuid) to authenticated;

-- القراءة للمسؤول الكامل فقط. كل عملية (txid) سطر واحد بأول 12 تفصيلة منها.
create or replace function public.lb_admin_audit_log(
  p_limit integer default 100, p_before bigint default null, p_user uuid default null
)
returns table (
  last_id bigint, at timestamptz, user_id uuid, actor text, total integer, entries jsonb
)
language plpgsql
stable
security definer
set search_path to 'leaderboard', 'public'
as $function$
begin
  perform public.lb_require('users');
  return query
  with g as (
    select l.txid, l.user_id, max(l.id) as last_id, min(l.at) as at,
           max(l.actor) as actor, count(*)::integer as total
    from leaderboard.audit_log l
    where p_user is null or l.user_id = p_user
    group by l.txid, l.user_id
    having p_before is null or max(l.id) < p_before
    order by max(l.id) desc
    limit least(greatest(coalesce(p_limit, 100), 1), 300)
  )
  select g.last_id, g.at, g.user_id, g.actor, g.total,
         (select jsonb_agg(jsonb_build_object(
                   'action', e.action, 'entity', e.entity, 'label', e.label, 'details', e.details
                 ) order by e.id)
          from (
            select * from leaderboard.audit_log a
            where a.txid = g.txid and a.user_id is not distinct from g.user_id
            order by a.id limit 12
          ) e)
  from g
  order by g.last_id desc;
end $function$;
revoke all on function public.lb_admin_audit_log(integer, bigint, uuid) from public, anon;
grant execute on function public.lb_admin_audit_log(integer, bigint, uuid) to authenticated;
