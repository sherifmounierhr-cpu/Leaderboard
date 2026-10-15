/*
 * رسائل الشاشة: صورة، ترحيب بالضيوف (مطوّرين بشعاراتهم)، وترحيب بموظف جديد.
 *
 * - image_url: صورة الرسالة — للترحيب والتحفيز اختيارية، وللموظف الجديد صورته.
 * - subtitle: سطر تحت العنوان — المسمّى الوظيفي للموظف، أو اسم شركة الضيوف.
 * - logos: شعارات الضيوف [{url, name}]، لحد ستة.
 *
 * الصور في مخزن مستقل (announcements) يرفع فيه أصحاب صلاحية «الرسائل»؛ مخزن
 * الصور الشخصية محروس بصلاحية المستشارين والفرق، وده قسم تاني.
 */

alter table leaderboard.announcements drop constraint if exists announcements_style_check;
alter table leaderboard.announcements add constraint announcements_style_check
  check (style in ('welcome', 'motivation', 'guests', 'newhire'));

alter table leaderboard.announcements
  add column if not exists image_url text,
  add column if not exists subtitle  text,
  add column if not exists logos     jsonb not null default '[]'::jsonb;

alter table leaderboard.announcements drop constraint if exists announcements_image_url_check;
alter table leaderboard.announcements add constraint announcements_image_url_check
  check (image_url is null or (char_length(image_url) <= 600 and image_url ~ '^https://'));
alter table leaderboard.announcements drop constraint if exists announcements_subtitle_check;
alter table leaderboard.announcements add constraint announcements_subtitle_check
  check (subtitle is null or char_length(subtitle) <= 80);
alter table leaderboard.announcements drop constraint if exists announcements_logos_check;
alter table leaderboard.announcements add constraint announcements_logos_check
  check (jsonb_typeof(logos) = 'array' and jsonb_array_length(logos) <= 6);

create or replace view public.lb_announcements with (security_invoker = true) as
select id, style, title, body, duration_s, clip_id, schedule, starts_at,
       to_char(daily_time::interval, 'HH24:MI') as daily_time,
       weekdays, active, created_at, updated_at,
       image_url, subtitle, logos
from leaderboard.announcements;

/*
 * p_extra = {image_url, subtitle, logos}. null = سيبهم زي ما هم: صفحة إدارة
 * قديمة لسه مفتوحة على جهاز تاني تحفظ من غير ما تمسح الصورة والشعارات.
 */
drop function if exists public.lb_admin_save_announcement(uuid, text, text, text, smallint, uuid, text, timestamptz, text, smallint[], boolean);

create or replace function public.lb_admin_save_announcement(
  p_id uuid, p_style text, p_title text, p_body text, p_duration smallint, p_clip_id uuid,
  p_schedule text, p_starts_at timestamptz, p_daily_time text, p_weekdays smallint[], p_active boolean,
  p_extra jsonb default null
)
returns uuid
language plpgsql security definer set search_path = leaderboard, public
as $$
declare
  v_id    uuid;
  v_logos jsonb := '[]'::jsonb;
  v_logo  jsonb;
begin
  perform public.lb_require('messages');

  if p_extra is not null then
    for v_logo in select * from jsonb_array_elements(coalesce(p_extra->'logos', '[]'::jsonb)) loop
      if jsonb_typeof(v_logo) <> 'object' or coalesce(v_logo->>'url', '') !~ '^https://'
         or char_length(v_logo->>'url') > 600 then
        raise exception 'شعار غير صالح' using errcode = '22023';
      end if;
      v_logos := v_logos || jsonb_build_array(jsonb_build_object(
        'url', v_logo->>'url',
        'name', left(btrim(coalesce(v_logo->>'name', '')), 60)
      ));
    end loop;
  end if;

  if p_id is null then
    insert into leaderboard.announcements
      (style, title, body, duration_s, clip_id, schedule, starts_at, daily_time, weekdays, active, created_by,
       image_url, subtitle, logos)
    values
      (p_style, btrim(p_title), nullif(btrim(p_body), ''), p_duration, p_clip_id, p_schedule,
       case when p_schedule = 'once' then coalesce(p_starts_at, now()) end,
       case when p_schedule = 'daily' then p_daily_time::time end,
       case when p_schedule = 'daily' then coalesce(p_weekdays, '{}') else '{}' end,
       coalesce(p_active, true), auth.uid(),
       nullif(btrim(p_extra->>'image_url'), ''), nullif(btrim(p_extra->>'subtitle'), ''), v_logos)
    returning id into v_id;
  else
    update leaderboard.announcements set
      style = p_style, title = btrim(p_title), body = nullif(btrim(p_body), ''),
      duration_s = p_duration, clip_id = p_clip_id, schedule = p_schedule,
      starts_at  = case when p_schedule = 'once' then coalesce(p_starts_at, now()) end,
      daily_time = case when p_schedule = 'daily' then p_daily_time::time end,
      weekdays   = case when p_schedule = 'daily' then coalesce(p_weekdays, '{}') else '{}' end,
      active = coalesce(p_active, true), updated_at = now(),
      image_url = case when p_extra is null then image_url else nullif(btrim(p_extra->>'image_url'), '') end,
      subtitle  = case when p_extra is null then subtitle  else nullif(btrim(p_extra->>'subtitle'), '') end,
      logos     = case when p_extra is null then logos     else v_logos end
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'الرسالة غير موجودة' using errcode = '22023';
    end if;
  end if;
  return v_id;
end $$;

revoke all on function public.lb_admin_save_announcement(uuid, text, text, text, smallint, uuid, text, timestamptz, text, smallint[], boolean, jsonb) from public, anon;
grant execute on function public.lb_admin_save_announcement(uuid, text, text, text, smallint, uuid, text, timestamptz, text, smallint[], boolean, jsonb) to authenticated;

-- ------------------------------------------------------------ مخزن الصور
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcements', 'announcements', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists lb_announcements_read on storage.objects;
create policy lb_announcements_read on storage.objects for select
  using (bucket_id = 'announcements');
drop policy if exists lb_announcements_insert on storage.objects;
create policy lb_announcements_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'announcements' and public.lb_can('messages'));
drop policy if exists lb_announcements_update on storage.objects;
create policy lb_announcements_update on storage.objects for update to authenticated
  using (bucket_id = 'announcements' and public.lb_can('messages'))
  with check (bucket_id = 'announcements' and public.lb_can('messages'));
drop policy if exists lb_announcements_delete on storage.objects;
create policy lb_announcements_delete on storage.objects for delete to authenticated
  using (bucket_id = 'announcements' and public.lb_can('messages'));
