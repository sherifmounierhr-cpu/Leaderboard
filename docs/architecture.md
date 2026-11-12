# Architecture

## Layout

```
src/
  features/                 admin screens, grouped the way the admin sidebar is
    people/                 agents, teams, directors (+cut-outs), owners, users, password card
    sales/                  periods, deals, reports, import/export
    screen/                 celebrations, messages, news, market rates, devices, display control
    system/                 storage, activity log
  shared/ui/                admin building blocks used by several features
                            (ImageStudio, PhotoField, VoiceRecorder, SearchSelect)
  components/               the TV board and its overlays (not admin)
  views/                    AdminView + the board screens
  composables/              shared singletons (state lives at module level)
  lib/                      pure helpers; adminTabs.ts = admin navigation, ui.ts = shared field styles
  i18n/                     ar.json / en.json
supabase/migrations/        database history (0000 → latest)
supabase/functions/         sheets-sync, screen-alert, admin-users, username-sign-in
api/                        Vercel functions: /api/news, /api/markets
```

## Rules of thumb

- **Admin navigation has one source:** `src/lib/adminTabs.ts` (groups, tabs, icons, labels, the
  permission each needs). To add a tab: add an entry there, render it in `AdminView.vue`, add the
  component under the matching `features/<group>/`. `tests/admin-nav.test.ts` fails if the
  permission list drifts from `lb_permission_keys()` in the database.
- **Permissions are enforced in the database**, never in the UI: every writer RPC starts with
  `lb_require('<section>')`. The UI only hides what a person can't use.
- **Show/hide switches** live in `features/screen/DisplayControlAdmin.vue` (a list of flags); each is
  a column in `board_settings` read by the screens through `useBoardMedia`.
- **Shared field styles:** import `FIELD` / `FIELD_SM` / `FIELD_AUTO` from `@/lib/ui`.

## Data flow

```
Google Sheets ──sheets-sync (cron)──▶ lb_sync ─┐
Admin page ──lb_admin_* RPCs (lb_require)──────┼▶ leaderboard.* tables ──▶ public.lb_* views ──▶ TV board
                                               │        │ realtime
                                               │        └▶ overlays (celebration, owner message, announcements…)
Vercel /api/news, /api/markets ────────────────┘ (read by the browser)
```
