# Phase 1.5 — Stabilization

P0 fixes from the Phase 1 forensic audit (2026-05-21). Tightens
silent-failure modes, codifies a hook-vs-store rule, and adds
validation + timeouts before Phase M doubles the event/IPC surface.

Workflow per step: `workflow.md` (impl → test pass → output verified
→ docs → commit). Do not start step N+1 until N is verified.

Grouping: four branches, each one PR, one or two commits inside.
After step 1.5.7 ships, tag `v0.1.1` as the launch baseline.

## Step ledger

| #     | Branch                        | Step                                                                                                          | Test                                                            | Data-quality verification                                                                                                            |
|-------|-------------------------------|---------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| 1.5.1 | `phase-1.5/data-integrity`    | Token-emit failure cancels the stream loop (F1 — `commands/prompt.rs:70` `let _ = emit_app.emit(...)`)        | mockito: emit fails mid-stream                                  | Loop exits within 1 token after emit failure; `token_count` equals actual emits, not attempts                                        |
| 1.5.2 | `phase-1.5/data-integrity`    | Cancel produces a terminal state distinct from Done (F12 — backend emits `prompt-cancelled` event)            | integration: cancel mid-stream                                  | Frontend sees `status="cancelled"`, distinct UI label, no `prompt-done` event fired for cancelled runs                               |
| 1.5.3 | `phase-1.5/state-architecture`| Document hook/store rule in `architecture.md` + delete dead `workspaceStore` fields (F2)                       | store unit: only `lastRunMetrics` + `setLastRunMetrics` remain  | `status`, `beginRun`, `receiveToken`, `finish`, `cancel` deleted; rule says hooks own ephemeral per-action state, store owns shared  |
| 1.5.4 | `phase-1.5/state-architecture`| Metrics format parity inline ↔ StatusBar (F3 — pick `"TTFT 8ms · 32.0 tok/s · 4 tokens"`, apply to both)        | render test asserts exact `textContent` equality                | One shared format function; AppIntegration test does `expect(inline).toEqual(statusbar)` byte-for-byte                               |
| 1.5.5 | `phase-1.5/ipc-hardening`     | Mutex poison recovery in `commands/prompt.rs` (F4) + clippy lint forbidding `Mutex::lock().unwrap()`           | unit: poison the timing mutex via callback panic                | `.unwrap_or_else(\|e\| e.into_inner())` used everywhere; metrics degrade to `None` on poison instead of panicking                    |
> 1.5.5 — ✅ shipped 2026-05-22 (phase-1.5/ipc-hardening, branched from main). New `backend/src/sync.rs` (19 lines): `MutexExt::lock_recover()` returns the inner value on `PoisonError` instead of panicking. New `backend/src/commands/prompt_payloads.rs` (32 lines): `TokenPayload`, `DonePayload` (now `pub`), and `done_payload_or_zero(timing)` which `match`es on `lock()` and returns a zero-valued payload on poison (refuses to surface poisoned-but-readable metrics). `commands/prompt.rs` adds `#![deny(clippy::unwrap_used)]` at module scope — clippy now blocks any future `.unwrap()` from being reintroduced in this file. All 4 internal `.lock().unwrap()` call sites switched to `.lock_recover()`. Test (`tests/prompt_poison_recovery.rs`): poisons the timing mutex by panicking while holding it on a side thread; asserts `timing.is_poisoned()`, then asserts `done_payload_or_zero` returns `token_count==0`, `ttft_ms==None`, `tokens_per_sec==None`. Second test verifies `lock_recover()` returns post-mutation data even when poisoned. Cargo 32/32 (+2); `cargo clippy --tests` clean. prompt.rs shrunk 95→81 lines (payloads + helper moved out). **Merge note for `phase-1.5/data-integrity` branch (which also creates `prompt_payloads.rs` with `CancelledPayload`):** the two versions of `prompt_payloads.rs` need to be combined at merge — keep both `done_payload_or_zero` (from here) and `CancelledPayload` (from 1.5.1). Both branches make the same payload structs `pub`, so that part is identical.
| 1.5.6 | `phase-1.5/ipc-hardening`     | Zod schemas at IPC event boundary (F6 — `TokenPayload`, `DonePayload` validated in `useStreamingRun`)          | unit: malformed payload rejected                                | Invalid payloads `console.error` + transition to `status="error"`; UI never sees `NaN`/`undefined`                                   |
| 1.5.7 | `phase-1.5/timeouts`          | Tauri invoke + reqwest timeouts (F7 — 30s on `run_prompt`, 5s on `stop_prompt`, 60s reqwest connect timeout)   | mockito hung response + vitest never-resolving promise          | `run_prompt` rejects with `AppError::Timeout` after 30s; `list_models` rejects after 5s; clear user message on each                  |

After each step: append a one-line note under the row — status
(✅ shipped / ⏳ in progress) + commit SHA + date. Same convention
as `02_phase1_implementation.md`.

## Prerequisites

- Phase 1 shipped at commit `f274a06`.
- Forensic findings F1–F21 captured in chat transcript (2026-05-21).
- All Phase 1 tests (cargo 30, vitest 40+) still green on `main`.

## Out of scope (deferred)

- **F5 path traversal** → Phase M (the HF download flow needs path
  sandboxing anyway; work compounds there).
- **F8–F11 UX gaps** (workspace path in errors, ModelPicker retry,
  empty-models copy, cwd-dependent default path) → Phase 2 polish.
- **F18 silent save overwrite** → not fixed via dialog (conventional
  dev-tool behavior, users find dialogs annoying); add a "saved"
  toast in Phase 2 polish instead.
- **All P2 findings (F13–F21)** → Phase 2.X polish sprint.

## v0.1.1 baseline

After 1.5.7 ships clean: tag `v0.1.1`. This is the foundation Phase M
builds on; do not regress it.

## Updating this doc

Append shipped notes per the convention. Do not re-flow the table.
