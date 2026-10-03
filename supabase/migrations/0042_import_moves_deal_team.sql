-- تعديل فريق الصفقة من ملف Excel.
--
-- قبل كده الفريق كان جزءاً من مفتاح الصفقة، فتغيير team في صف مُصدَّر ثم رفعه
-- كان يضيف صفقة ثانية بالفريق الجديد ويترك القديمة. الآن: صف في الملف يطابق
-- صفقة موجودة في كل شيء إلا الفريق = نقل الصفقة للفريق الجديد (ومبلغها ينتقل
-- معها في مبيعات الربع)، بشرط أن الصفقة القديمة ليست مطلوبة بفريقها القديم في
-- نفس الملف.
--
-- تعديل نصّي على الدالة كما هي في القاعدة — بدون إعادة كتابة جسمها.
do $$
declare
  v_oid oid := 'public.lb_admin_import(smallint, jsonb)'::regprocedure;
  def   text := pg_get_functiondef(v_oid);
  a1 constant text := E'  v_incoming_deals numeric;\n';
  a2 constant text := E'    v_skipped := v_skipped + (r.copies - greatest(v_need, 0));\n';
  a3 constant text := '''deals_skipped'', v_skipped)';
  fixed text;
begin
  if position('v_moved' in def) > 0 then
    return; -- مطبَّق بالفعل
  end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 or position(a3 in def) = 0 then
    raise exception 'lb_admin_import: لم يُعثر على موضع التعديل';
  end if;

  fixed := replace(def, a1, a1 || E'  v_moved   integer := 0;\n  v_take    integer;\n  m         record;\n');

  fixed := replace(fixed, a2, a2 || $block$
    -- نفس الصفقة مسجَّلة لفريق آخر وغير مطلوبة به في الملف: تُنقل بدل أن تتكرر
    if v_need > 0 then
      for m in
        select d.team_id as old_team, count(*)::integer as have
        from leaderboard.deals d
        where d.agent_id = r.agent_id and d.deal_date = r.deal_date and d.amount_egp = r.amount
          and d.developer is not distinct from r.developer and d.project is not distinct from r.project
          and d.team_id is distinct from v_team
        group by d.team_id
      loop
        exit when v_need <= 0;

        -- كم صفاً في الملف يطلب هذه الصفقة بفريقها القديم؟ هؤلاء يبقون مكانهم
        select m.have - count(*)::integer into v_take
        from jsonb_array_elements(coalesce(p_payload->'deals', '[]'::jsonb)) x
        where (x->>'date')::date = r.deal_date
          and round((x->>'amount')::numeric, 2) = r.amount
          and left(nullif(btrim(coalesce(x->>'developer', '')), ''), 80) is not distinct from r.developer
          and left(nullif(btrim(coalesce(x->>'project', '')), ''), 80) is not distinct from r.project
          and exists (
            select 1 from leaderboard.agents a
            where a.id = r.agent_id
              and (lower(a.name) = lower(btrim(x->>'agent')) or lower(a.name_ar) = lower(btrim(x->>'agent')))
          )
          and (
            case
              when nullif(btrim(coalesce(x->>'team', '')), '') is null
                then (select team_id from leaderboard.agents where id = r.agent_id)
              else (select t.id from leaderboard.teams t
                     where lower(t.name) = lower(btrim(x->>'team')) or lower(t.name_ar) = lower(btrim(x->>'team'))
                     order by (lower(t.name) = lower(btrim(x->>'team'))) desc limit 1)
            end
          ) is not distinct from m.old_team;

        v_take := least(v_take, v_need);
        continue when v_take <= 0;

        update leaderboard.deals set team_id = v_team
        where id in (
          select d.id from leaderboard.deals d
          where d.agent_id = r.agent_id and d.deal_date = r.deal_date and d.amount_egp = r.amount
            and d.developer is not distinct from r.developer and d.project is not distinct from r.project
            and d.team_id is not distinct from m.old_team
          order by d.created_at desc
          limit v_take
        );

        update leaderboard.sales
           set amount_egp = greatest(amount_egp - r.amount * v_take, 0)
         where agent_id = r.agent_id
           and year = extract(year from r.deal_date)::smallint
           and quarter = extract(quarter from r.deal_date)::smallint
           and team_id is not distinct from m.old_team;

        insert into leaderboard.sales (agent_id, year, quarter, amount_egp, team_id)
        values (r.agent_id, extract(year from r.deal_date)::smallint, extract(quarter from r.deal_date)::smallint,
                r.amount * v_take, v_team)
        on conflict (agent_id, year, quarter, team_id)
        do update set amount_egp = leaderboard.sales.amount_egp + excluded.amount_egp;

        v_need  := v_need - v_take;
        v_moved := v_moved + v_take;
      end loop;
    end if;
$block$);

  fixed := replace(fixed, a3, a3 || ' || jsonb_build_object(''deals_moved'', v_moved)');
  execute fixed;
end $$;
