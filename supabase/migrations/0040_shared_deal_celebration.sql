-- الصفقة المشتركة: احتفال واحد يجمع المستشارَين بدل احتفال لكل نصيب.
-- الحدث يُسجَّل باسم المستشار الأول بمبلغ الصفقة كله، ومعه المشارك ونصيبه.
alter table leaderboard.sale_events
  add column if not exists partner_id uuid references leaderboard.agents (id) on delete set null,
  add column if not exists partner_amount_egp numeric(14,2),
  add column if not exists share_pct numeric(5,2);

create or replace view public.lb_sale_events as
 SELECT e.id,
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
    t.name AS team,
    t.name_ar AS team_ar,
    e.song_id,
    e.mute,
    e.duration_s,
    e.partner_id,
    p.name AS partner_name,
    p.name_ar AS partner_name_ar,
    p.photo_url AS partner_photo_url,
    e.partner_amount_egp,
    e.share_pct
   FROM (((leaderboard.sale_events e
     JOIN leaderboard.agents a ON ((a.id = e.agent_id)))
     LEFT JOIN leaderboard.teams t ON ((t.id = a.team_id)))
     LEFT JOIN leaderboard.agents p ON ((p.id = e.partner_id)));

-- تعديل نصّي على lb_admin_add_deal كما هي في القاعدة: في الصفقة المشتركة يُكتم
-- الاحتفال التلقائي لكل نصيب، ويُسجَّل حدث واحد مشترك بعد حساب الإجمالي.
do $$
declare
  v_oid oid := 'public.lb_admin_add_deal(uuid, date, numeric, text, text, uuid, uuid, uuid, numeric)'::regprocedure;
  def   text := pg_get_functiondef(v_oid);
  a1 constant text := 'v_shared  := gen_random_uuid();';
  a2 constant text := 'from leaderboard.sales where agent_id = p_agent_id and year = v_year and quarter = v_q;';
  fixed text;
begin
  if position('partner_amount_egp, share_pct)' in def) > 0 then
    return; -- مطبَّق بالفعل
  end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 then
    raise exception 'lb_admin_add_deal: لم يُعثر على موضع التعديل';
  end if;
  fixed := replace(def, a1, a1 || E'\n    perform set_config(''leaderboard.silent'', ''on'', true);');
  fixed := replace(fixed, a2, a2 || E'\n
  if v_shared is not null then
    perform set_config(''leaderboard.silent'', ''off'', true);
    if v_year = extract(year from v_today)::smallint and v_q = extract(quarter from v_today)::smallint then
      insert into leaderboard.sale_events
        (agent_id, year, quarter, kind, amount_egp, total_egp, created_by, partner_id, partner_amount_egp, share_pct)
      values (p_agent_id, v_year, v_q, ''sale'', p_amount, v_total, auth.uid(), p_partner_id, v_amount2, v_pct);
    end if;
  end if;');
  execute fixed;
end $$;
