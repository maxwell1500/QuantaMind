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
> 1.5.1 — ✅ shipped 2026-05-21 (phase-1.5/data-integrity). Extracted `make_token_handler` to `commands/prompt_handler.rs`; payloads to `commands/prompt_payloads.rs` (prompt.rs 95→94 lines). `emit(...).map_err(\|_\| ())` feeds the handler; on `Err` the shared `CancellationToken` is cancelled, stream loop exits at the next cancel check in `ollama.rs:59`. `EVENT_CANCELLED` + `CancelledPayload` added; `run_prompt` branches on `token.is_cancelled()` after `run_prompt_inner` to emit `prompt-cancelled` (cancelled path, token_count only) vs `prompt-done` (completed path, full metrics). Frontend wires up the new event in 1.5.2 — user-triggered cancel temporarily loses its terminal event on this branch but the merged result (1.5.1+1.5.2) is correct. Test (`backend/tests/prompt_emit_failure.rs`): mockito 5-token stream, fake emit fails on attempt 3; asserts attempts==3 (stream stops AT failure, not after) AND token_count==2 (records successes only, not attempts) AND cancel.is_cancelled(). Cargo 31/31 (+1), vitest 40/40 unchanged.
| 1.5.2 | `phase-1.5/data-integrity`    | Cancel produces a terminal state distinct from Done (F12 — backend emits `prompt-cancelled` event)            | integration: cancel mid-stream                                  | Frontend sees `status="cancelled"`, distinct UI label, no `prompt-done` event fired for cancelled runs                               |
| 1.5.3 | `phase-1.5/state-architecture`| Document hook/store rule in `architecture.md` + delete dead `workspaceStore` fields (F2)                       | store unit: only `lastRunMetrics` + `setLastRunMetrics` remain  | `status`, `beginRun`, `receiveToken`, `finish`, `cancel` deleted; rule says hooks own ephemeral per-action state, store owns shared  |
| 1.5.4 | `phase-1.5/state-architecture`| Metrics format parity inline ↔ StatusBar (F3 — pick `"TTFT 8ms · 32.0 tok/s · 4 tokens"`, apply to both)        | render test asserts exact `textContent` equality                | One shared format function; AppIntegration test does `expect(inline).toEqual(statusbar)` byte-for-byte                               |
| 1.5.5 | `phase-1.5/ipc-hardening`     | Mutex poison recovery in `commands/prompt.rs` (F4) + clippy lint forbidding `Mutex::lock().unwrap()`           | unit: poison the timing mutex via callback panic                | `.unwrap_or_else(\|e\| e.into_inner())` used everywhere; metrics degrade to `None` on poison instead of panicking                    |
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
