# Database

Supabase (Postgres). Tables live in the private `leaderboard` schema; the browser only touches
`public.lb_*` views and `SECURITY DEFINER` RPCs. 61 migrations (`0000` → `0061`) in
`supabase/migrations/`, applied in order. Live schema at the time of writing: 30 tables,
24 `lb_*` views, 83 functions, 37 policies.

## Where things are defined (by domain)

| Domain | Migrations |
|---|---|
| Foundation: schema, sync, cron, RLS, auth gate | 0000–0005, 0007, 0015, 0027, 0029 |
| Sales, teams, agents, deals | 0001, 0002, 0006, 0008, 0009, 0012, 0013, 0017, 0021, 0024, 0025, 0030, 0038, 0039, 0041–0048, 0054, 0055 |
| Screen, celebration, replay, display switches | 0009, 0016, 0031–0036, 0040, 0050, 0051, 0058–0060 |
| Devices and alerts | 0018, 0026, 0028 |
| Announcements, owner messages, media | 0016, 0052, 0053 |
| Users, roles, permissions, photos | 0010, 0011, 0022, 0023, 0049, 0056, 0057 |
| News and markets | 0019, 0020, 0050 |
| Storage buckets and policies | 0004, 0014, 0016, 0052, 0053, 0057 |
| Audit | 0038, 0049, 0056 |

## Objects redefined many times (the last migration wins)

Views: `lb_board_settings` (0016, 0019, 0020, 0028, 0036, 0050, 0058, 0059), `lb_team_standings`
(0001, 0012, 0013, 0044, 0054, 0055), `lb_agent_standings` (0001, 0013, 0045, 0054, 0055),
`lb_team_contributions` (0013, 0045, 0054, 0055).
Functions: `lb_admin_celebrate_quarter` (0031–0035), `lb_admin_add_deal` (0017, 0021, 0038, 0039),
`lb_admin_list_users` (0022, 0023, 0056, 0057), `lb_admin_set_display_flag` (0059, 0060),
`lb_my_access` (0022, 0056, 0057).

Seven migrations edit functions by patching their live text (`pg_get_functiondef` + `replace`):
0022 (26 writers' guard line), 0037, 0040, 0042, 0043, 0046, 0047, 0049, 0053.
`lb_admin_import` is built from 0006 → 0024 → 0025 → 0030, then patched by 0037, 0042, 0043, 0047.

## Do not squash by concatenating files

Because of the patched functions above, no migration file holds the final text of
`lb_admin_import`, `lb_admin_add_deal`, `lb_storage_usage` and others. A baseline has to come
from the **live** schema:

```bash
# needs the Supabase CLI, Docker and the database password (Project settings → Database)
supabase login
supabase link --project-ref mbvscayjwnuvkvolbpoz
supabase db dump --schema leaderboard,public -f supabase/baseline.sql
```

Then check it on a scratch branch (`supabase branches create`), compare view output for every
quarter against production, and only then move `0000`–`00NN` into `supabase/migrations/_archive/`
and keep the dump as `0100_baseline.sql`. Keep the archive: it is the history of why things are
the way they are.

## Conventions

- Every writer RPC: `security definer`, `set search_path = leaderboard, public`,
  `perform public.lb_require('<section>')`, `revoke ... from public, anon`, `grant ... to authenticated`.
- Views: always `create or replace view ... with (security_invoker = true)`. Recreating a view without
  the option drops it (six views lost it this way until 0061).
- Reads: `lb_read_all` RLS policy for `authenticated`; admin-only tables use `lb_can_view(...)`.
- New permission section: add it to `lb_permission_keys()` **and** `ADMIN_TABS` in
  `src/lib/adminTabs.ts` — `tests/admin-nav.test.ts` fails if they differ.
- New display switch: a column in `leaderboard.board_settings`, add it to the `lb_board_settings`
  view and to the allow-list in `lb_admin_set_display_flag`, then one entry in
  `src/features/screen/DisplayControlAdmin.vue`.
- Realtime tables are listed in the `supabase_realtime` publication (sales, sale_events, deals,
  devices, team_events, celebration_intros, event_replays, announcements, board_settings,
  media_files, news_hidden, news_casts, owners, owner_messages).

## Open checks

- `lb_board_settings` exposes `alert_email` to every authenticated user; consider moving it out.
- `supabase/config.toml` is absent, so each Edge Function's `verify_jwt` setting lives only in the
  dashboard (`sheets-sync`, `screen-alert`, `username-sign-in`: off; `admin-users`: on).
