# Prompt history

Every completed run is recorded to per-workspace history. Open the
History drawer (the **History** button in the workspace header; Cmd+Y
arrives with keyboard shortcuts in 2.10) to see the last 50 runs and
restore any of them.

## On disk

Under the workspace's hidden `.quantamind/` directory:

```
<workspace>/.quantamind/
├── history.yaml         # newest-first list, capped at 50 (LRU)
└── runs/<id>.txt        # full output blob, one per entry
```

`history.yaml` stays small: it holds the inputs (model, system, user,
params) plus a 280-char output preview, length, and token count. The
full output goes to a blob keyed by entry id. When the 51st run pushes
the list over 50, the oldest entry is evicted *and* its blob deleted.

## Entry shape

`HistoryEntry` (`backend/src/persistence/prompts/history.rs`):
`id`, `prompt_path?`, `model`, `system`, `user`, `params`,
`output_preview`, `output_len`, `token_count`, `ran_at` (ISO 8601).

## Recording

Runs are recorded from the frontend after the `prompt-done` event, where
the full output and run context are already in hand
(`features/history/recordRun.ts`). This keeps the streaming command and
the inference path free of persistence concerns. Cancelled runs and
empty outputs are not recorded. A failure to record (e.g. no workspace
open) is logged, never surfaced as a run error.

## Restore

Clicking an entry loads its inputs back into the current prompt editors
(user, system, params) and selects its model, ready to re-run. It edits
the in-memory prompt only; persisting to the file follows the normal
save/auto-save path, so history never silently overwrites disk.

## Commands

`history_append`, `history_list`, `history_get` (full output blob),
`history_clear` — all scoped to the open workspace
(`backend/src/commands/history.rs`).

## Verification

- `backend/src/persistence/prompts/history_tests.rs` — LRU cap, ordering,
  unicode-safe preview, round-trip.
- `backend/tests/history_lifecycle.rs` — 51-run eviction + blob deletion
  on real temp dirs.
- Frontend: `recordRun` shape + `HistoryPanel` list/restore/clear tests.
- Live check (pending GUI): run 60 prompts, list shows 50, oldest gone.
