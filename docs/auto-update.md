# Auto-update

QuantaMind ships with `tauri-plugin-updater` (wired in v0.1). v0.2 adds a
background startup check, in-dialog release notes, and explicit consent.

## Startup check (rate-limited)

On launch, `StartupUpdate`
(`frontend/src/features/help/components/StartupUpdate.tsx`) runs a
background `check()` — but at most once per 24h. The last check time is
persisted as `last_update_check_at` in `user_settings.yaml`; `shouldCheck`
(`features/help/updateSchedule.ts`) gates it. The stamp is written after
every check (found or not), so a dismissed prompt won't reappear until the
next day.

## Explicit consent

If a newer version is found, a bottom banner appears with the version and
release notes. Two choices, **never auto-install**:

- **Install now** — downloads, verifies the signature, installs, relaunches.
- **Remind me later** — dismisses; the 24h stamp is already set.

The Help tab's manual **Check for updates** card remains for on-demand
checks.

## Release notes as markdown

`latest.json`'s `notes` field (filled from `RELEASE_NOTES.md` by
`scripts/release.sh`) renders through a tiny markdown subset renderer
(`frontend/src/shared/markdown.tsx`) — headings, bold, inline code,
links, and bullets. No new dependency. Both the startup banner and the
Help-tab checker use it.

## User settings store

`user_settings.yaml` (app config dir) is the new home for app-wide prefs:
`last_update_check_at` (this step), plus `first_run_complete` (2.6) and
`theme` (2.7). Backend: `persistence/user_settings.rs` +
`commands/user_settings.rs` (`get_user_settings` / `set_user_settings`).

## Verification

- `features/help/__tests__/updateSchedule.test.ts` — 24h gate.
- `shared/__tests__/markdown.test.tsx` — bold/code/links/headings/bullets.
- `features/help/__tests__/StartupUpdate.test.tsx` — within-window skip,
  due-check shows banner + stamps, Remind-me-later dismiss, up-to-date.
- Backend `user_settings_tests.rs` — round-trip + default omission.
- Live check (pending GUI): point the endpoint at a fixture and confirm
  the banner renders real notes on a genuine upgrade path.
