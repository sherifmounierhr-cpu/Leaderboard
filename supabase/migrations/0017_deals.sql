-- ==================================================================
-- الصفقات: إدخال المبيعات صفقة صفقة بتاريخها ومبلغها.
--
-- الصفقة بتزوّد إجمالي المستشار في ربعها (الإجمالي بيفضل هو مصدر اللوحة،
-- فالأرقام القديمة والاستيراد من Excel ما يتأثروش). الاحتفال بيحصل لوحده:
-- زيادة amount_egp في الربع الجاري بتشغّل trigger الأحداث الموجود من 0009.
-- ==================================================================

create table if not exists leaderboard.deals (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references leaderboard.agents (id) on delete cascade,
  -- فريق المستشار وقت التسجيل: نقله لفريق تاني لا يحرّك أرقام الفريق القديم
  team_id     uuid references leaderboard.teams (id) on delete set null,
  deal_date   date not null,
  amount_egp  numeric(14, 2) not null check (amount_egp > 0),
  year        smallint generated always as (extract(year from deal_date)::smallint) stored,
  quarter     smallint generated always as (extract(quarter from deal_date)::smallint) stored,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists deals_agent_period_idx on leaderboard.deals (agent_id, year, quarter);
create index if not exists deals_date_idx on leaderboard.deals (deal_date desc);

alter table leaderboard.deals enable row level security;
drop policy if exists lb_read_all on leaderboard.deals;
create policy lb_read_all on leaderboard.deals for select to authenticated using (true);
revoke all on leaderboard.deals from anon;
grant select on leaderboard.deals to authenticated;

create or replace view public.lb_deals with (security_invoker = true) as
select d.id, d.agent_id, d.team_id, d.deal_date, d.amount_egp, d.year, d.quarter, d.created_at,
       a.name, a.name_ar, a.photo_url,
       t.name as team, t.name_ar as team_ar
from leaderboard.deals d
join leaderboard.agents a on a.id = d.agent_id
left join leaderboard.teams t on t.id = d.team_id;

revoke all on public.lb_deals from anon;
grant select on public.lb_deals to authenticated;

-- ------------------------------------------------------------ إضافة صفقة
-- الزيادة بتتضاف على صف المبيعات بتاع (المستشار، الربع، الفريق). الـ trigger
-- الموجود بيسجّل الحدث ويشغّل الاحتفال لو الربع هو الجاري بتوقيت القاهرة.
create or replace function public.lb_admin_add_deal(
  p_agent_id uuid, p_date date, p_amount numeric
)
returns jsonb
language plpgsql security definer set search_path = leaderboard, public
as $$
declare
  v_team  uuid;
  v_year  smallint := extract(year from p_date)::smallint;
  v_q     smallint := extract(quarter from p_date)::smallint;
  v_today date     := (now() at time zone 'Africa/Cairo')::date;
  v_id    uuid;
  v_total numeric;
begin
  perform public.lb_admin_guard();

  if p_amount is null or p_amount <= 0 then
    raise exception 'مبلغ الصفقة لازم يكون أكبر من صفر' using errcode = '22023';
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

  insert into leaderboard.deals (agent_id, team_id, deal_date, amount_egp, created_by)
  values (p_agent_id, v_team, p_date, p_amount, auth.uid())
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
end $$;

-- ------------------------------------------------------------ حذف صفقة
-- الخصم من نفس صف الفريق اللي اتسجلت عليه، ومايقلّش عن صفر.
create or replace function public.lb_admin_delete_deal(p_id uuid)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
declare d leaderboard.deals%rowtype;
begin
  perform public.lb_admin_guard();
  delete from leaderboard.deals where id = p_id returning * into d;
  if not found then
    raise exception 'الصفقة غير موجودة' using errcode = '22023';
  end if;

  update leaderboard.sales
     set amount_egp = greatest(amount_egp - d.amount_egp, 0)
   where agent_id = d.agent_id and year = d.year and quarter = d.quarter
     and team_id is not distinct from d.team_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lb_admin_add_deal(uuid, date, numeric)',
    'public.lb_admin_delete_deal(uuid)'
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
       where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = 'deals'
     ) then
    execute 'alter publication supabase_realtime add table leaderboard.deals';
  end if;
end $$;
