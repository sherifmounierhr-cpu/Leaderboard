-- مديرو الشركة (ثابتون، تُدار قائمتهم من الإدارة مرة) + افتتاحية احتفال
-- نهاية الربع: بطاقة أولى تظهر قبل الفرق، فيها كلمة الإدارة وصور المديرين
-- مع موسيقاها الخاصة.

-- ------------------------------------------------------------ مديرو الشركة
create table if not exists leaderboard.directors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  name_ar     text check (name_ar is null or char_length(btrim(name_ar)) between 1 and 80),
  title       text not null check (char_length(btrim(title)) between 1 and 80),
  title_ar    text check (title_ar is null or char_length(btrim(title_ar)) between 1 and 80),
  photo_url   text,
  position    smallint not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists directors_position_idx on leaderboard.directors (position);

alter table leaderboard.directors enable row level security;
drop policy if exists lb_read_all on leaderboard.directors;
create policy lb_read_all on leaderboard.directors for select to authenticated using (true);
revoke all on leaderboard.directors from anon;
grant select on leaderboard.directors to authenticated;

create or replace view public.lb_directors
with (security_invoker = true) as
select id, name, name_ar, title, title_ar, photo_url, position, active, created_at
from leaderboard.directors
order by position, created_at;

revoke all on public.lb_directors from anon;
grant select on public.lb_directors to authenticated;

create or replace function public.lb_admin_save_director(
  p_id uuid, p_name text, p_name_ar text, p_title text, p_title_ar text,
  p_photo_url text, p_position smallint, p_active boolean
) returns uuid
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_id uuid;
begin
  perform public.lb_require('celebrate');
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'الاسم مطلوب' using errcode = '22023';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'المنصب مطلوب' using errcode = '22023';
  end if;

  if p_id is null then
    insert into leaderboard.directors (name, name_ar, title, title_ar, photo_url, position, active)
    values (btrim(p_name), nullif(btrim(coalesce(p_name_ar, '')), ''), btrim(p_title),
            nullif(btrim(coalesce(p_title_ar, '')), ''), p_photo_url, coalesce(p_position, 0), coalesce(p_active, true))
    returning id into v_id;
  else
    update leaderboard.directors set
      name = btrim(p_name),
      name_ar = nullif(btrim(coalesce(p_name_ar, '')), ''),
      title = btrim(p_title),
      title_ar = nullif(btrim(coalesce(p_title_ar, '')), ''),
      photo_url = p_photo_url,
      position = coalesce(p_position, 0),
      active = coalesce(p_active, true)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'المدير غير موجود' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end $fn$;

revoke all on function public.lb_admin_save_director(uuid, text, text, text, text, text, smallint, boolean) from public, anon;
grant execute on function public.lb_admin_save_director(uuid, text, text, text, text, text, smallint, boolean) to authenticated;

create or replace function public.lb_admin_delete_director(p_id uuid)
returns void
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
begin
  perform public.lb_require('celebrate');
  delete from leaderboard.directors where id = p_id;
end $fn$;

revoke all on function public.lb_admin_delete_director(uuid) from public, anon;
grant execute on function public.lb_admin_delete_director(uuid) to authenticated;

-- ------------------------------------------------------------ افتتاحية الاحتفال
create table if not exists leaderboard.celebration_intros (
  id          bigint generated always as identity primary key,
  year        smallint not null,
  quarter     smallint not null check (quarter between 1 and 4),
  kind        text not null check (kind in ('quarter')),
  message     text check (message is null or char_length(message) <= 280),
  song_id     uuid references leaderboard.media_files (id) on delete set null,
  mute        boolean not null default false,
  duration_s  smallint not null default 18,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists celebration_intros_created_idx on leaderboard.celebration_intros (created_at desc);

alter table leaderboard.celebration_intros enable row level security;
drop policy if exists lb_read_all on leaderboard.celebration_intros;
create policy lb_read_all on leaderboard.celebration_intros for select to authenticated using (true);
revoke all on leaderboard.celebration_intros from anon;
grant select on leaderboard.celebration_intros to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = 'celebration_intros'
     ) then
    execute 'alter publication supabase_realtime add table leaderboard.celebration_intros';
  end if;
end $$;

create or replace view public.lb_celebration_intros
with (security_invoker = true) as
select
  e.id, e.year, e.quarter, e.kind, e.message, e.song_id, e.mute, e.duration_s, e.created_at,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'name_ar', d.name_ar,
                                        'title', d.title, 'title_ar', d.title_ar, 'photo_url', d.photo_url)
                     order by d.position, d.created_at)
    from leaderboard.directors d
    where d.active
  ), '[]'::jsonb) as directors
from leaderboard.celebration_intros e;

revoke all on public.lb_celebration_intros from anon;
grant select on public.lb_celebration_intros to authenticated;

-- ------------------------------------------------------------ تحديث دالة الإطلاق
-- التوقيع اتغيّر (باراميترين جداد)، فلازم نشيل النسخة القديمة صراحة قبل ما
-- ننشئ الجديدة، وإلا بوستجرس هيعتبرهم دالتين مختلفتين (تحميل زائد).
drop function if exists public.lb_admin_celebrate_quarter(smallint, smallint, text, text);

create or replace function public.lb_admin_celebrate_quarter(
  p_year smallint, p_quarter smallint, p_team_note text, p_agent_note text,
  p_intro_message text default null, p_intro_song_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = leaderboard, public
as $fn$
declare
  v_team_note  text := nullif(btrim(p_team_note), '');
  v_agent_note text := nullif(btrim(p_agent_note), '');
  v_intro_msg  text := nullif(btrim(p_intro_message), '');
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
  if char_length(v_intro_msg) > 280 then
    raise exception 'كلمة الإدارة أطول من 280 حرفاً' using errcode = '22023';
  end if;

  -- الافتتاحية أولاً — ID أقل من كل اللي جاي بعدها، فتظهر أول واحدة
  insert into leaderboard.celebration_intros (year, quarter, kind, message, song_id, created_by)
  values (p_year, p_quarter, 'quarter', v_intro_msg, p_intro_song_id, auth.uid());

  -- الفرق اللي عملت أي مبيعات في الربع — من الأقل مبيعات للأعلى
  for r in
    select t.id as team_id, sum(s.amount_egp) as total
    from leaderboard.teams t
    join leaderboard.sales s on s.team_id = t.id and s.year = p_year and s.quarter = p_quarter
    where t.active
    group by t.id
    having sum(s.amount_egp) > 0
    order by sum(s.amount_egp) asc
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

  -- كل مستشار عمل أي مبيعات في الربع — من الأقل مبيعات للأعلى
  for r in
    select s.agent_id, sum(s.amount_egp) as total
    from leaderboard.sales s
    join leaderboard.agents a on a.id = s.agent_id and a.active
    where s.year = p_year and s.quarter = p_quarter
    group by s.agent_id
    having sum(s.amount_egp) > 0
    order by sum(s.amount_egp) asc
  loop
    insert into leaderboard.sale_events (agent_id, year, quarter, kind, total_egp, note, created_by)
    values (r.agent_id, p_year, p_quarter, 'quarter', r.total, v_agent_note, auth.uid());
    v_agents := v_agents + 1;
  end loop;

  return jsonb_build_object('teams', v_teams, 'managers', v_managers, 'agents', v_agents);
end $fn$;

revoke all on function public.lb_admin_celebrate_quarter(smallint, smallint, text, text, text, uuid) from public, anon;
grant execute on function public.lb_admin_celebrate_quarter(smallint, smallint, text, text, text, uuid) to authenticated;
