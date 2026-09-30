-- احتفال نهاية الربع: زرار يدوي في صفحة الإدارة يطلق دفعة احتفالات مرة واحدة —
--   1) لكل فريق عمل أي مبيعات في الربع: بطاقة فريق (اسمه + رسالة + صور
--      مديريه مجتمعين)، ثم بطاقة فردية منفصلة لكل مدير من مديريه.
--   2) لكل مستشار عمل أي مبيعات في الربع: بطاقة فردية بمجهوده.
-- الرسالتان (الفريق والفرد) ثابتتان لكل الدفعة، يكتبهما المسؤول وقت الإطلاق.

-- ------------------------------------------------------------ نوع جديد للأحداث الفردية
alter table leaderboard.sale_events drop constraint if exists sale_events_kind_check;
alter table leaderboard.sale_events
  add constraint sale_events_kind_check check (kind in ('sale', 'manual', 'quarter'));

-- ------------------------------------------------------------ أحداث الفرق
create table if not exists leaderboard.team_events (
  id          bigint generated always as identity primary key,
  team_id     uuid not null references leaderboard.teams (id) on delete cascade,
  year        smallint not null,
  quarter     smallint not null check (quarter between 1 and 4),
  kind        text not null check (kind in ('quarter')),
  total_egp   numeric(14, 2) not null default 0,
  note        text check (note is null or char_length(note) <= 140),
  song_id     uuid references leaderboard.media_files (id) on delete set null,
  mute        boolean not null default false,
  duration_s  smallint,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists team_events_created_idx on leaderboard.team_events (created_at desc);

alter table leaderboard.team_events enable row level security;
drop policy if exists lb_read_all on leaderboard.team_events;
create policy lb_read_all on leaderboard.team_events for select to authenticated using (true);
revoke all on leaderboard.team_events from anon;
grant select on leaderboard.team_events to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = 'team_events'
     ) then
    execute 'alter publication supabase_realtime add table leaderboard.team_events';
  end if;
end $$;

create or replace view public.lb_team_events
with (security_invoker = true) as
select
  e.id, e.team_id, e.year, e.quarter, e.kind, e.total_egp, e.note,
  e.song_id, e.mute, e.duration_s, e.created_at,
  t.name, t.name_ar, t.photo_url,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'name_ar', a.name_ar, 'photo_url', a.photo_url)
                     order by l.position)
    from leaderboard.team_leads l join leaderboard.agents a on a.id = l.agent_id
    where l.team_id = t.id and l.role = 'manager'
  ), '[]'::jsonb) as managers
from leaderboard.team_events e
join leaderboard.teams t on t.id = e.team_id;

revoke all on public.lb_team_events from anon;
grant select on public.lb_team_events to authenticated;

-- ------------------------------------------------------------ الإطلاق
create or replace function public.lb_admin_celebrate_quarter(
  p_year smallint, p_quarter smallint, p_team_note text, p_agent_note text
) returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_team_note  text := nullif(btrim(p_team_note), '');
  v_agent_note text := nullif(btrim(p_agent_note), '');
  v_teams      int := 0;
  v_managers   int := 0;
  v_agents     int := 0;
  r            record;
  m            record;
begin
  perform public.lb_require('celebrate');

  if p_year is null or p_quarter is null or p_quarter not between 1 and 4 then
    raise exception 'ربع غير صالح' using errcode = '22023';
  end if;
  if char_length(v_team_note) > 140 or char_length(v_agent_note) > 140 then
    raise exception 'الرسالة أطول من 140 حرفاً' using errcode = '22023';
  end if;

  -- الفرق اللي عملت أي مبيعات في الربع
  for r in
    select t.id as team_id, sum(s.amount_egp) as total
    from leaderboard.teams t
    join leaderboard.sales s on s.team_id = t.id and s.year = p_year and s.quarter = p_quarter
    where t.active
    group by t.id
    having sum(s.amount_egp) > 0
  loop
    insert into leaderboard.team_events (team_id, year, quarter, kind, total_egp, note, created_by)
    values (r.team_id, p_year, p_quarter, 'quarter', r.total, v_team_note, auth.uid());
    v_teams := v_teams + 1;

    for m in
      select l.agent_id
      from leaderboard.team_leads l
      join leaderboard.agents a on a.id = l.agent_id and a.active
      where l.team_id = r.team_id and l.role = 'manager'
      order by l.position
    loop
      insert into leaderboard.sale_events (agent_id, year, quarter, kind, total_egp, note, created_by)
      values (
        m.agent_id, p_year, p_quarter, 'quarter',
        coalesce((select sum(amount_egp) from leaderboard.sales
                  where agent_id = m.agent_id and year = p_year and quarter = p_quarter), 0),
        v_team_note, auth.uid()
      );
      v_managers := v_managers + 1;
    end loop;
  end loop;

  -- كل مستشار عمل أي مبيعات في الربع
  for r in
    select s.agent_id, sum(s.amount_egp) as total
    from leaderboard.sales s
    join leaderboard.agents a on a.id = s.agent_id and a.active
    where s.year = p_year and s.quarter = p_quarter
    group by s.agent_id
    having sum(s.amount_egp) > 0
  loop
    insert into leaderboard.sale_events (agent_id, year, quarter, kind, total_egp, note, created_by)
    values (r.agent_id, p_year, p_quarter, 'quarter', r.total, v_agent_note, auth.uid());
    v_agents := v_agents + 1;
  end loop;

  return jsonb_build_object('teams', v_teams, 'managers', v_managers, 'agents', v_agents);
end $fn$;

revoke all on function public.lb_admin_celebrate_quarter(smallint, smallint, text, text) from public, anon;
grant execute on function public.lb_admin_celebrate_quarter(smallint, smallint, text, text) to authenticated;
