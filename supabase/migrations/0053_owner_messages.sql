/*
 * كلمة أصحاب العمل: تبويبان في الإدارة (owner1 و owner2)، كل واحد بصورة
 * صاحبه واسمه، ويبعت كلمة مكتوبة أو صوتية — للكل، لفريق، أو لشخص بعينه —
 * تظهر على كل الشاشات المفتوحة لحظياً.
 *
 * التبويبان صلاحيتان منفصلتان: حساب كل صاحب عمل ممكن ياخد تبويبه بس.
 */

create or replace function public.lb_permission_keys()
returns text[]
language sql immutable
set search_path to ''
as $$
  select array['periods', 'deals', 'celebrate', 'messages', 'agents', 'teams',
               'reports', 'data', 'newsfeed', 'rates', 'devices', 'storage',
               'owner1', 'owner2'];
$$;

create table if not exists leaderboard.owners (
  slot       smallint primary key check (slot in (1, 2)),
  name       text not null default '' check (char_length(name) <= 60),
  name_ar    text check (name_ar is null or char_length(name_ar) <= 60),
  title      text check (title is null or char_length(title) <= 60),
  title_ar   text check (title_ar is null or char_length(title_ar) <= 60),
  photo_url  text check (photo_url is null or (char_length(photo_url) <= 600 and photo_url ~ '^https://')),
  updated_at timestamptz not null default now()
);
insert into leaderboard.owners (slot) values (1), (2) on conflict do nothing;

create table if not exists leaderboard.owner_messages (
  id            uuid primary key default gen_random_uuid(),
  slot          smallint not null references leaderboard.owners (slot),
  body          text check (body is null or char_length(body) between 1 and 500),
  audio_url     text check (audio_url is null or (char_length(audio_url) <= 600 and audio_url ~ '^https://')),
  audio_seconds numeric(6, 2) check (audio_seconds is null or audio_seconds between 0.3 and 600),
  to_agent_id   uuid references leaderboard.agents (id) on delete set null,
  to_team_id    uuid references leaderboard.teams (id) on delete set null,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  check (body is not null or audio_url is not null)
);
create index if not exists owner_messages_created_idx on leaderboard.owner_messages (created_at desc);

do $$
declare t text;
begin
  foreach t in array array['owners', 'owner_messages'] loop
    execute format('alter table leaderboard.%I enable row level security', t);
    execute format('drop policy if exists lb_read_all on leaderboard.%I', t);
    execute format('create policy lb_read_all on leaderboard.%I for select to authenticated using (true)', t);
    execute format('revoke all on leaderboard.%I from anon', t);
    execute format('grant select on leaderboard.%I to authenticated', t);
  end loop;
end $$;

create or replace view public.lb_owners with (security_invoker = true) as
select slot, name, name_ar, title, title_ar, photo_url, updated_at
from leaderboard.owners;

/* الرسالة جاهزة للعرض: صاحب العمل والمُوجَّه له (شخص أو فريق) في صف واحد */
create or replace view public.lb_owner_messages with (security_invoker = true) as
select m.id, m.slot, m.body, m.audio_url, m.audio_seconds, m.created_at,
       o.name as owner_name, o.name_ar as owner_name_ar, o.title as owner_title, o.title_ar as owner_title_ar,
       o.photo_url as owner_photo,
       m.to_agent_id, a.name as to_agent_name, a.name_ar as to_agent_name_ar,
       coalesce(a.cutout_url, a.photo_url) as to_agent_photo,
       m.to_team_id, t.name as to_team_name, t.name_ar as to_team_name_ar, t.photo_url as to_team_photo
from leaderboard.owner_messages m
join leaderboard.owners o on o.slot = m.slot
left join leaderboard.agents a on a.id = m.to_agent_id
left join leaderboard.teams t on t.id = m.to_team_id
order by m.created_at desc
limit 60;

revoke all on public.lb_owners, public.lb_owner_messages from anon;
grant select on public.lb_owners, public.lb_owner_messages to authenticated;

create or replace function public.lb_admin_owner_save(
  p_slot smallint, p_name text, p_name_ar text, p_title text, p_title_ar text, p_photo_url text
)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
begin
  if p_slot not in (1, 2) then
    raise exception 'تبويب غير معروف' using errcode = '22023';
  end if;
  perform public.lb_require('owner' || p_slot);
  update leaderboard.owners set
    name = btrim(coalesce(p_name, '')),
    name_ar = nullif(btrim(p_name_ar), ''),
    title = nullif(btrim(p_title), ''),
    title_ar = nullif(btrim(p_title_ar), ''),
    photo_url = nullif(btrim(p_photo_url), ''),
    updated_at = now()
  where slot = p_slot;
end $$;

create or replace function public.lb_admin_owner_send(
  p_slot smallint, p_body text, p_audio_url text, p_audio_seconds numeric, p_to_agent uuid, p_to_team uuid
)
returns uuid
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_id uuid;
begin
  if p_slot not in (1, 2) then
    raise exception 'تبويب غير معروف' using errcode = '22023';
  end if;
  perform public.lb_require('owner' || p_slot);
  if nullif(btrim(p_body), '') is null and nullif(btrim(p_audio_url), '') is null then
    raise exception 'اكتب الرسالة أو سجّل صوتك' using errcode = '22023';
  end if;
  if p_to_agent is not null and p_to_team is not null then
    raise exception 'اختر شخصاً أو فريقاً، مش الاتنين' using errcode = '22023';
  end if;
  insert into leaderboard.owner_messages (slot, body, audio_url, audio_seconds, to_agent_id, to_team_id, created_by)
  values (p_slot, nullif(btrim(p_body), ''), nullif(btrim(p_audio_url), ''), p_audio_seconds, p_to_agent, p_to_team, auth.uid())
  returning id into v_id;
  -- السجل ما يكبرش: آخر 100 لكل صاحب عمل
  delete from leaderboard.owner_messages
   where slot = p_slot
     and id not in (select id from leaderboard.owner_messages where slot = p_slot order by created_at desc limit 100);
  return v_id;
end $$;

create or replace function public.lb_admin_owner_delete_message(p_id uuid)
returns void
language plpgsql security definer set search_path = leaderboard, public
as $$
declare v_slot smallint;
begin
  select slot into v_slot from leaderboard.owner_messages where id = p_id;
  if v_slot is null then
    raise exception 'الرسالة غير موجودة' using errcode = '22023';
  end if;
  perform public.lb_require('owner' || v_slot);
  delete from leaderboard.owner_messages where id = p_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.lb_admin_owner_save(smallint, text, text, text, text, text)',
    'public.lb_admin_owner_send(smallint, text, text, numeric, uuid, uuid)',
    'public.lb_admin_owner_delete_message(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ------------------------------------------------------------ المخازن
-- الصوت في media (نفس قيود الصوت)، والصورة في announcements
drop policy if exists lb_media_insert on storage.objects;
create policy lb_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (public.lb_can('celebrate') or public.lb_can('messages') or public.lb_can('newsfeed')
    or public.lb_can('owner1') or public.lb_can('owner2')));
drop policy if exists lb_media_update on storage.objects;
create policy lb_media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (public.lb_can('celebrate') or public.lb_can('messages') or public.lb_can('newsfeed')
    or public.lb_can('owner1') or public.lb_can('owner2')))
  with check (bucket_id = 'media' and (public.lb_can('celebrate') or public.lb_can('messages') or public.lb_can('newsfeed')
    or public.lb_can('owner1') or public.lb_can('owner2')));
drop policy if exists lb_media_delete on storage.objects;
create policy lb_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (public.lb_can('celebrate') or public.lb_can('messages') or public.lb_can('newsfeed')
    or public.lb_can('owner1') or public.lb_can('owner2')));

drop policy if exists lb_announcements_insert on storage.objects;
create policy lb_announcements_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'announcements' and (public.lb_can('messages') or public.lb_can('owner1') or public.lb_can('owner2')));
drop policy if exists lb_announcements_update on storage.objects;
create policy lb_announcements_update on storage.objects for update to authenticated
  using (bucket_id = 'announcements' and (public.lb_can('messages') or public.lb_can('owner1') or public.lb_can('owner2')))
  with check (bucket_id = 'announcements' and (public.lb_can('messages') or public.lb_can('owner1') or public.lb_can('owner2')));
drop policy if exists lb_announcements_delete on storage.objects;
create policy lb_announcements_delete on storage.objects for delete to authenticated
  using (bucket_id = 'announcements' and (public.lb_can('messages') or public.lb_can('owner1') or public.lb_can('owner2')));

-- الشاشات بتسمع الرسائل والتعديل على صورة صاحب العمل لحظياً
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['owners', 'owner_messages'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'leaderboard' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table leaderboard.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- الصوت المرفوع لرسائل أصحاب العمل مش «يتيم»: تبويب المساحة ما يقترحش يمسحه
do $$
declare def text;
begin
  def := pg_get_functiondef('public.lb_storage_usage()'::regprocedure);
  if def not like '%owner_messages%' then
    execute replace(def,
      'else not exists (select 1 from leaderboard.media_files m where m.path = o.name)',
      'else not exists (select 1 from leaderboard.media_files m where m.path = o.name)
               and not exists (select 1 from leaderboard.owner_messages om where om.audio_url like ''%/media/'' || o.name)');
  end if;
end $$;
