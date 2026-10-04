-- كل الفرق المفعّلة تظهر في الربع الجاري حتى قبل أول صفقة أو هدف.
--
-- الترتيب كان يعرض فقط الفريق الذي له مبيعات أو أهداف في الربع، فأول الربع
-- تظهر اللوحة بفريق واحد. الآن الفريق المفعّل الذي لا صف له في الربع الجاري
-- يدخل بصفر مبيعات وصفر هدف وعدد أعضائه الحاليين. الأرباع السابقة كما هي.
create or replace view public.lb_team_standings as
 WITH sales_by_team AS (
         SELECT s.team_id,
            s.year,
            s.quarter,
            sum(s.amount_egp) AS deals,
            array_agg(DISTINCT s.agent_id) AS agent_ids
           FROM (leaderboard.sales s
             JOIN leaderboard.agents a ON (((a.id = s.agent_id) AND a.active)))
          WHERE (s.team_id IS NOT NULL)
          GROUP BY s.team_id, s.year, s.quarter
        ), targets_by_team AS (
         SELECT g.team_id,
            g.year,
            g.quarter,
            sum(g.target_egp) AS target,
            array_agg(DISTINCT g.agent_id) AS agent_ids
           FROM (leaderboard.targets g
             JOIN leaderboard.agents a ON (((a.id = g.agent_id) AND a.active)))
          WHERE (g.team_id IS NOT NULL)
          GROUP BY g.team_id, g.year, g.quarter
        ), recorded AS (
         SELECT COALESCE(s.team_id, g.team_id) AS team_id,
            COALESCE(s.year, g.year) AS year,
            COALESCE(s.quarter, g.quarter) AS quarter,
            COALESCE(s.deals, (0)::numeric) AS deals,
            COALESCE(g.target, (0)::numeric) AS target,
            (( SELECT count(DISTINCT x.x) AS count
                   FROM unnest((COALESCE(s.agent_ids, '{}'::uuid[]) || COALESCE(g.agent_ids, '{}'::uuid[]))) x(x)))::integer AS members
           FROM (sales_by_team s
             FULL JOIN targets_by_team g ON (((g.team_id = s.team_id) AND (g.year = s.year) AND (g.quarter = s.quarter))))
        ), cur AS (
         SELECT (EXTRACT(year FROM (now() AT TIME ZONE 'Africa/Cairo')))::smallint AS year,
            (EXTRACT(quarter FROM (now() AT TIME ZONE 'Africa/Cairo')))::smallint AS quarter
        ), per_team AS (
         SELECT r.team_id, r.year, r.quarter, r.deals, r.target, r.members
           FROM recorded r
        UNION ALL
         SELECT t.id,
            cur.year,
            cur.quarter,
            (0)::numeric,
            (0)::numeric,
            (( SELECT count(*) FROM leaderboard.agents a WHERE ((a.team_id = t.id) AND a.active)))::integer
           FROM leaderboard.teams t,
            cur
          WHERE (t.active AND (NOT (EXISTS ( SELECT 1
                   FROM recorded r
                  WHERE ((r.team_id = t.id) AND (r.year = cur.year) AND (r.quarter = cur.quarter))))))
        )
 SELECT p.team_id,
    t.name,
    t.name_ar,
    t.photo_url,
    p.year,
    p.quarter,
    p.deals,
    p.target,
    p.members,
        CASE
            WHEN (p.target > (0)::numeric) THEN (round(((p.deals / p.target) * (100)::numeric)))::integer
            ELSE 0
        END AS pct,
    (rank() OVER (PARTITION BY p.year, p.quarter ORDER BY p.deals DESC, t.name))::integer AS rank,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', a.id, 'role', l.role, 'name', a.name, 'name_ar', a.name_ar, 'photo_url', a.photo_url) ORDER BY l.role, l."position") AS jsonb_agg
           FROM (leaderboard.team_leads l
             JOIN leaderboard.agents a ON ((a.id = l.agent_id)))
          WHERE (l.team_id = t.id)), '[]'::jsonb) AS leads
   FROM (per_team p
     JOIN leaderboard.teams t ON (((t.id = p.team_id) AND t.active)));
