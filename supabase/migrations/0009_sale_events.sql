-- سجل الأحداث: مصدر الإشعارات والاحتفالات.
--
-- قبل هذا الملف كانت كل شاشة تستنتج «صفقة جديدة» بمقارنة الإجماليات في
-- المتصفح، فالحدث يعيش فقط في الشاشة التي كانت مفتوحة لحظتها ولا تاريخ له.
-- الآن الزيادة تُسجَّل هنا مرة واحدة أياً كان مصدر الكتابة (الإدارة، مزامنة
-- الشيت، استيراد Excel)، وكل الشاشات تقرأ نفس السجل وتشترك فيه لحظياً.

create table if not exists leaderboard.sale_events (
  id          bigint generated always as identity primary key,
  agent_id    uuid not null references leaderboard.agents (id) on delete cascade,
  year        smallint not null,
  quarter     smallint not null check (quarter between 1 and 4),
  -- sale: زيادة مبيعات مكتشفة تلقائياً · manual: تهنئة يطلقها مسؤول يدوياً
  kind        text not null check (kind in ('sale', 'manual')),
  amount_egp  numeric(14, 2) not null default 0,
  total_egp   numeric(14, 2) not null default 0,
  note        text check (char_length(note) <= 140),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists sale_events_created_idx on leaderboard.sale_events (created_at desc);

alter table leaderboard.sale_events enable row level security;
drop policy if exists lb_read_all on leaderboard.sale_events;
create policy lb_read_all on leaderboard.sale_events for select to authenticated using (true);
revoke all on leaderboard.sale_events from anon;
grant select on leaderboard.sale_events to authenticated;

-- ------------------------------------------------------------ الكشف التلقائي
-- الربع الحالي بتوقيت القاهرة: استيراد أرقام ربع مضى ليس «صفقة جديدة» تستحق
-- احتفالاً على الشاشة، وإلا لأغرق استيراد سنة كاملة الإشعارات بمئات الأحداث.
create or replace function leaderboard.record_sale_event()
returns trigger
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_now   timestamp := now() at time zone 'Africa/Cairo';
  v_year  smallint  := extract(year from v_now);
  v_q     smallint  := extract(quarter from v_now);
  v_before numeric  := case when tg_op = 'UPDATE' then old.amount_egp else 0 end;
begin
  if new.amount_egp > v_before and new.year = v_year and new.quarter = v_q then
    insert into leaderboard.sale_events (agent_id, year, quarter, kind, amount_egp, total_egp, created_by)
    values (new.agent_id, new.year, new.quarter, 'sale', new.amount_egp - v_before, new.amount_egp, auth.uid());
  end if;
  return new;
end $fn$;

revoke all on function leaderboard.record_sale_event() from public, anon, authenticated;

drop trigger if exists sales_record_event on leaderboard.sales;
create trigger sales_record_event
  after insert or update of amount_egp on leaderboard.sales
  for each row execute function leaderboard.record_sale_event();

-- ------------------------------------------------------------ الاحتفال اليدوي
create or replace function public.lb_admin_celebrate(p_agent_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_now   timestamp := now() at time zone 'Africa/Cairo';
  v_year  smallint  := extract(year from v_now);
  v_q     smallint  := extract(quarter from v_now);
  v_note  text      := nullif(btrim(p_note), '');
  v_total numeric;
begin
  perform public.lb_admin_guard();
  if not exists (select 1 from leaderboard.agents where id = p_agent_id) then
    raise exception 'المستشار غير موجود' using errcode = '22023';
  end if;
  if char_length(v_note) > 140 then
    raise exception 'الرسالة أطول من 140 حرفاً' using errcode = '22023';
  end if;

  select amount_egp into v_total
  from leaderboard.sales
  where agent_id = p_agent_id and year = v_year and quarter = v_q;

  insert into leaderboard.sale_events (agent_id, year, quarter, kind, total_egp, note, created_by)
  values (p_agent_id, v_year, v_q, 'manual', coalesce(v_total, 0), v_note, auth.uid());
end $fn$;

revoke all on function public.lb_admin_celebrate(uuid, text) from public, anon;
grant execute on function public.lb_admin_celebrate(uuid, text) to authenticated;

-- ------------------------------------------------------------ القراءة
-- الـ view يحمل الأسماء والصور، فالإشعار يُعرض حتى لو المستشار خارج الربع
-- المعروض على اللوحة لحظتها.
create or replace view public.lb_sale_events
with (security_invoker = true) as
select
  e.id,
  e.agent_id,
  e.year,
  e.quarter,
  e.kind,
  e.amount_egp,
  e.total_egp,
  e.note,
  e.created_at,
  a.name,
  a.name_ar,
  a.photo_url,
  t.name    as team,
  t.name_ar as team_ar
from leaderboard.sale_events e
join leaderboard.agents a on a.id = e.agent_id
left join leaderboard.teams t on t.id = a.team_id;

revoke all on public.lb_sale_events from anon;
grant select on public.lb_sale_events to authenticated;

-- ------------------------------------------------------------ Realtime
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = 'sale_events'
     ) then
    execute 'alter publication supabase_realtime add table leaderboard.sale_events';
  end if;
end $$;
