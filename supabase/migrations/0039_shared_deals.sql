-- صفقة مشتركة بين مستشارَين بنسبة تقسيم.
-- تُخزَّن صفّين في deals (صف لكل مستشار بنصيبه) يربطهما shared_id، فكل ما يقرأ
-- الصفقات (الإجماليات، الفرق، التقارير، التصدير، الاحتفال) يشتغل كما هو.
alter table leaderboard.deals
  add column if not exists shared_id uuid,
  add column if not exists share_pct numeric(5,2)
    check (share_pct is null or (share_pct > 0 and share_pct < 100));
create index if not exists deals_shared_idx on leaderboard.deals (shared_id) where shared_id is not null;

create or replace view public.lb_deals as
 SELECT d.id,
    d.agent_id,
    d.team_id,
    d.deal_date,
    d.amount_egp,
    d.year,
    d.quarter,
    d.created_at,
    a.name,
    a.name_ar,
    a.photo_url,
    t.name AS team,
    t.name_ar AS team_ar,
    d.developer,
    d.project,
    d.shared_id,
    d.share_pct
   FROM ((leaderboard.deals d
     JOIN leaderboard.agents a ON ((a.id = d.agent_id)))
     LEFT JOIN leaderboard.teams t ON ((t.id = d.team_id)));

drop function if exists public.lb_admin_add_deal(uuid, date, numeric, text, text, uuid);

create or replace function public.lb_admin_add_deal(
  p_agent_id uuid, p_date date, p_amount numeric,
  p_developer text default null, p_project text default null, p_team_id uuid default null,
  p_partner_id uuid default null, p_partner_team_id uuid default null, p_share_pct numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
declare
  v_team    uuid;
  v_team2   uuid;
  v_year    smallint := extract(year from p_date)::smallint;
  v_q       smallint := extract(quarter from p_date)::smallint;
  v_today   date     := (now() at time zone 'Africa/Cairo')::date;
  v_id      uuid;
  v_total   numeric;
  v_dev     text := nullif(btrim(coalesce(p_developer, '')), '');
  v_proj    text := nullif(btrim(coalesce(p_project, '')), '');
  v_shared  uuid;
  v_pct     numeric;
  v_amount  numeric := p_amount;
  v_amount2 numeric;
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

  if p_partner_id is not null then
    if p_partner_id = p_agent_id then
      raise exception 'اختر مستشاراً آخر للمشاركة في الصفقة' using errcode = '22023';
    end if;
    select team_id into v_team2 from leaderboard.agents where id = p_partner_id;
    if not found then
      raise exception 'المستشار المشارك غير موجود' using errcode = '22023';
    end if;
    if p_partner_team_id is not null then
      if not exists (select 1 from leaderboard.teams where id = p_partner_team_id) then
        raise exception 'الفريق غير موجود' using errcode = '22023';
      end if;
      v_team2 := p_partner_team_id;
    end if;
    v_pct := round(coalesce(p_share_pct, 50), 2);
    if v_pct <= 0 or v_pct >= 100 then
      raise exception 'نسبة المشاركة يجب أن تكون بين 1 و 99' using errcode = '22023';
    end if;
    v_shared  := gen_random_uuid();
    v_amount  := round(p_amount * v_pct / 100, 2);
    v_amount2 := p_amount - v_amount;
    if v_amount <= 0 or v_amount2 <= 0 then
      raise exception 'مبلغ الصفقة أصغر من أن يُقسَّم بهذه النسبة' using errcode = '22023';
    end if;
  end if;

  insert into leaderboard.deals
    (agent_id, team_id, deal_date, amount_egp, developer, project, created_by, shared_id, share_pct)
  values (p_agent_id, v_team, p_date, v_amount, left(v_dev, 80), left(v_proj, 80), auth.uid(), v_shared, v_pct)
  returning id into v_id;

  insert into leaderboard.sales (agent_id, year, quarter, amount_egp, team_id)
  values (p_agent_id, v_year, v_q, v_amount, v_team)
  on conflict (agent_id, year, quarter, team_id)
  do update set amount_egp = leaderboard.sales.amount_egp + excluded.amount_egp;

  if v_shared is not null then
    insert into leaderboard.deals
      (agent_id, team_id, deal_date, amount_egp, developer, project, created_by, shared_id, share_pct)
    values (p_partner_id, v_team2, p_date, v_amount2, left(v_dev, 80), left(v_proj, 80), auth.uid(),
            v_shared, 100 - v_pct);

    insert into leaderboard.sales (agent_id, year, quarter, amount_egp, team_id)
    values (p_partner_id, v_year, v_q, v_amount2, v_team2)
    on conflict (agent_id, year, quarter, team_id)
    do update set amount_egp = leaderboard.sales.amount_egp + excluded.amount_egp;
  end if;

  select coalesce(sum(amount_egp), 0) into v_total
  from leaderboard.sales where agent_id = p_agent_id and year = v_year and quarter = v_q;

  return jsonb_build_object(
    'id', v_id, 'year', v_year, 'quarter', v_q, 'total_egp', v_total,
    'amount_egp', v_amount, 'partner_amount_egp', v_amount2,
    'celebrated', v_year = extract(year from v_today)::smallint
                  and v_q = extract(quarter from v_today)::smallint
  );
end $function$;

revoke all on function public.lb_admin_add_deal(uuid, date, numeric, text, text, uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.lb_admin_add_deal(uuid, date, numeric, text, text, uuid, uuid, uuid, numeric) to authenticated, service_role;

-- حذف صفقة مشتركة يحذف نصيب المستشارَين معاً
create or replace function public.lb_admin_delete_deal(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'leaderboard', 'public'
as $function$
declare
  d      leaderboard.deals%rowtype;
  v_seen boolean := false;
begin
  perform public.lb_require('deals');
  for d in
    delete from leaderboard.deals x
    where x.id = p_id
       or x.shared_id = (select shared_id from leaderboard.deals where id = p_id)
    returning *
  loop
    v_seen := true;
    update leaderboard.sales
       set amount_egp = greatest(amount_egp - d.amount_egp, 0)
     where agent_id = d.agent_id and year = d.year and quarter = d.quarter
       and team_id is not distinct from d.team_id;
  end loop;
  if not v_seen then
    raise exception 'الصفقة غير موجودة' using errcode = '22023';
  end if;
end $function$;
