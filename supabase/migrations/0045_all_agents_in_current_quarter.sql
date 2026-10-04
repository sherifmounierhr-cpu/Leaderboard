-- كل المستشارين المفعّلين يظهرون في الربع الجاري حتى قبل أول صفقة (مثل 0044 للفرق).
-- المستشار الذي لا مبيعات مسجَّلة له في الربع الجاري يدخل بصفر، في ترتيب
-- المستشارين وفي قائمة أعضاء فريقه الحالي. الأرباع السابقة كما هي.
create or replace view public.lb_agent_standings as
 WITH cur AS (
         SELECT (EXTRACT(year FROM (now() AT TIME ZONE 'Africa/Cairo')))::smallint AS year,
            (EXTRACT(quarter FROM (now() AT TIME ZONE 'Africa/Cairo')))::smallint AS quarter
        ), recorded AS (
         SELECT s.agent_id,
            s.year,
            s.quarter,
            sum(s.amount_egp) AS deals
           FROM leaderboard.sales s
          GROUP BY s.agent_id, s.year, s.quarter
        ), per_agent AS (
         SELECT r.agent_id, r.year, r.quarter, r.deals
           FROM recorded r
        UNION ALL
         SELECT a.id, cur.year, cur.quarter, (0)::numeric
           FROM leaderboard.agents a,
            cur
          WHERE (a.active AND (NOT (EXISTS ( SELECT 1
                   FROM recorded r
                  WHERE ((r.agent_id = a.id) AND (r.year = cur.year) AND (r.quarter = cur.quarter))))))
        )
 SELECT a.id AS agent_id,
    a.name,
    a.name_ar,
    t.name AS team,
    t.name_ar AS team_ar,
    a.photo_url,
    p.year,
    p.quarter,
    p.deals,
    COALESCE(g.target_egp, (0)::numeric) AS target,
        CASE
            WHEN (COALESCE(g.target_egp, (0)::numeric) > (0)::numeric) THEN (round(((p.deals / g.target_egp) * (100)::numeric)))::integer
            ELSE 0
        END AS pct,
    (rank() OVER (PARTITION BY p.year, p.quarter ORDER BY p.deals DESC, a.name))::integer AS rank
   FROM (((per_agent p
     JOIN leaderboard.agents a ON (((a.id = p.agent_id) AND a.active)))
     LEFT JOIN leaderboard.teams t ON ((t.id = a.team_id)))
     LEFT JOIN leaderboard.targets g ON (((g.agent_id = a.id) AND (g.year = p.year) AND (g.quarter = p.quarter))));

create or replace view public.lb_team_contributions as
 WITH cur AS (
         SELECT (EXTRACT(year FROM (now() AT TIME ZONE 'Africa/Cairo')))::smallint AS year,
            (EXTRACT(quarter FROM (now() AT TIME ZONE 'Africa/Cairo')))::smallint AS quarter
        ), rows AS (
         SELECT s.team_id, s.agent_id, s.year, s.quarter, s.amount_egp
           FROM leaderboard.sales s
        UNION ALL
         SELECT a.team_id, a.id, cur.year, cur.quarter, (0)::numeric(14,2)
           FROM leaderboard.agents a,
            cur
          WHERE (a.active AND (a.team_id IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM leaderboard.sales s
                  WHERE ((s.agent_id = a.id) AND (s.year = cur.year) AND (s.quarter = cur.quarter))))))
        )
 SELECT s.team_id,
    t.name AS team,
    t.name_ar AS team_ar,
    a.id AS agent_id,
    a.name,
    a.name_ar,
    a.photo_url,
    s.year,
    s.quarter,
    s.amount_egp AS deals,
    COALESCE(g.target_egp, (0)::numeric) AS target,
        CASE
            WHEN (COALESCE(g.target_egp, (0)::numeric) > (0)::numeric) THEN (round(((s.amount_egp / g.target_egp) * (100)::numeric)))::integer
            ELSE 0
        END AS pct,
    (rank() OVER (PARTITION BY s.team_id, s.year, s.quarter ORDER BY s.amount_egp DESC, a.name))::integer AS rank
   FROM (((rows s
     JOIN leaderboard.agents a ON (((a.id = s.agent_id) AND a.active)))
     JOIN leaderboard.teams t ON ((t.id = s.team_id)))
     LEFT JOIN leaderboard.targets g ON (((g.agent_id = s.agent_id) AND (g.year = s.year) AND (g.quarter = s.quarter) AND (g.team_id = s.team_id))));
