-- ---------------------------------------------------------------------------
-- 0021 — اسم المطوّر واسم المشروع على الصفقة.
--
-- الاتنين اختياريين: الصفقات المسجّلة قبل كده مالهاش القيم دي، ومش كل صفقة
-- بيكون المشروع معروف وقت التسجيل.
--
-- الدالة القديمة بـ3 معاملات بتتشال وتتبدل بواحدة بقيم افتراضية، فالشاشة
-- اللي لسه فاتحة نسخة قديمة من الكود تفضل شغّالة من غير ما تكسر.
-- ---------------------------------------------------------------------------

alter table leaderboard.deals
  add column if not exists developer text check (developer is null or length(btrim(developer)) between 1 and 80),
  add column if not exists project   text check (project   is null or length(btrim(project))   between 1 and 80);

create index if not exists deals_developer_idx on leaderboard.deals (developer) where developer is not null;
create index if not exists deals_project_idx   on leaderboard.deals (project)   where project   is not null;

-- الأعمدة الجديدة في الآخر: create or replace مش بيسمح بإعادة ترتيب أعمدة view
create or replace view public.lb_deals with (security_invoker = true) as
select d.id, d.agent_id, d.team_id, d.deal_date, d.amount_egp, d.year, d.quarter, d.created_at,
       a.name, a.name_ar, a.photo_url,
       t.name as team, t.name_ar as team_ar,
       d.developer, d.project
from leaderboard.deals d
join leaderboard.agents a on a.id = d.agent_id
left join leaderboard.teams t on t.id = d.team_id;

revoke all on public.lb_deals from anon;
grant select on public.lb_deals to authenticated;

/*
 * الأسماء المستعملة قبل كده، عشان الإدخال يقترحها بدل ما نبني جدول مطوّرين
 * ومشاريع كامل: الأسماء بتتكرر، والاقتراح بيمنع «سوديك» و«سودك» في نفس القائمة.
 */
create or replace view public.lb_deal_names with (security_invoker = true) as
select 'developer' as kind, btrim(developer) as value, count(*) as uses
from leaderboard.deals where developer is not null and btrim(developer) <> ''
group by 1, 2
union all
select 'project', btrim(project), count(*)
from leaderboard.deals where project is not null and btrim(project) <> ''
group by 1, 2;

revoke all on public.lb_deal_names from anon;
grant select on public.lb_deal_names to authenticated;

drop function if exists public.lb_admin_add_deal(uuid, date, numeric);

create or replace function public.lb_admin_add_deal(
  p_agent_id uuid, p_date date, p_amount numeric,
  p_developer text default null, p_project text default null
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
  v_dev   text := nullif(btrim(coalesce(p_developer, '')), '');
  v_proj  text := nullif(btrim(coalesce(p_project, '')), '');
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
end $$;

revoke all on function public.lb_admin_add_deal(uuid, date, numeric, text, text) from public, anon;
grant execute on function public.lb_admin_add_deal(uuid, date, numeric, text, text) to authenticated;
