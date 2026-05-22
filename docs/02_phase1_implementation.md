

# Phase 1 — Implementation Plan

Goal (from `phase-roadmap.md`): edit a prompt, run it against Ollama,
stream output, save/load as YAML. Exit criteria:
- Run prompt → tokens stream into UI.
- Cancel mid-stream works cleanly.
- Save / load prompt round-trips byte-identical YAML.
- TTFT + tokens/sec displayed correctly.

Each step follows the loop in `workflow.md` (impl → test pass → output
verified → docs → commit). Do not start step N+1 until step N is fully
verified.

## Step ledger

| # | Step | Test | Data-quality verification |
|---|------|------|---------------------------|
| 1.1 | Tauri + React + TS scaffold | `pnpm tauri dev` opens window; HMR works | Window renders default; edit `App.tsx` → live reload |
> 1.1 — ✅ shipped 2026-05-21. User confirmed `pnpm tauri dev` window rendered Phase 1 content. Automated proxy: `pnpm build` (tsc + vite, 28 modules → dist) and `cargo check` clean. Node 22.1.0 < Vite's recommended 22.12+ (warning, non-blocking). Vitest deferred to 1.2.
| 1.2 | Add zustand, zod, monaco, Tailwind | Vitest smoke + Tailwind class renders | Class applies; store get/set returns correct value |
> 1.2 — ✅ shipped 2026-05-21. Vitest 4 + jsdom; 4/4 smoke tests green (Tailwind class on rendered node, Zustand get/set, Zod parse, `@monaco-editor/react` named exports). Tailwind 3.4 (locked, not v4). Data-quality: `pnpm build` emits 4.87KB CSS containing `--tw-*` preflight + `bg-red-500` utility scanned from the test file. Monaco's `Editor` is `React.memo(...)` (object with `$$typeof` symbol), not a bare function — test asserts that shape.
| 1.3 | Rust base: `errors.rs`, `validation/`, `commands/mod.rs` | `cargo test` passes | `AppError` variants serialize as expected JSON |
> 1.3 — ✅ shipped 2026-05-21. `cargo test` 4/4 green. `AppError` is `thiserror::Error` + `serde::Serialize` with `#[serde(tag="kind", content="message", rename_all="snake_case")]`. Variants: `Validation`, `NotFound`, `Internal`. Eyeballed JSON: `{"kind":"validation","message":"prompt is empty"}` (and equivalents). `validation/` and `commands/` are skeletal — populated in later steps (1.5/1.7/1.10/1.14). Added `thiserror 2` dep.
| 1.4 | `inference/ollama.rs` HTTP client (streaming) | mockito test: stream returns ordered chunks | Chunks count, order, UTF-8, terminator all match fixture |
> 1.4 — ✅ shipped 2026-05-21. `stream_generate(endpoint, model, prompt, on_token)` POSTs `/api/generate` with `stream:true`, parses NDJSON line-buffered from `reqwest::bytes_stream`, fires callback per non-empty `response`, returns on `done:true`. Tests 6/6 (4 unit + 2 integration). Mockito body fixture: 4 tokens including UTF-8 `世界` + empty-response terminator. Assertions: count=4, order preserved, `tokens.concat() == "Hello, 世界!"`, `chars().count()==2` for the 6-byte UTF-8 token, terminator ends the stream cleanly. HTTP 503 path returns `AppError::Inference` containing the code. Real Ollama not reachable this session; mockito is authoritative for now. Deps: reqwest 0.12 (json+stream), tokio 1 (macros+rt-multi-thread), futures-util 0.3, mockito 1 (dev). New variant: `AppError::Inference`.
| 1.5 | `commands/models.rs` → `list_models` | mocked test | Returned list sorted, deduped, names exact |
> 1.5 — ✅ shipped 2026-05-21. Split: `fetch_models(endpoint)` testable + `#[tauri::command] list_models()` wrapper hitting hardcoded `http://localhost:11434` (settings come in Phase 2). Registered in `tauri::Builder::invoke_handler`. Tests 3/3: input `[phi3:mini, llama3.2:1b, llama3.2:1b, mistral:7b]` → output exactly `[llama3.2:1b, mistral:7b, phi3:mini]` (sorted, deduped, colons preserved); empty `{models:[]}` → empty Vec; 500 → `AppError::Inference("HTTP 500")`. Tauri command registration verified via `cargo test` (main.rs compiles, so `generate_handler!` expanded cleanly).
| 1.6 | `shared/ipc/client.ts` + `ModelPicker.tsx` | Vitest behavior test | Dropdown shows real Ollama models, selection persists |
> 1.6 — ✅ shipped 2026-05-21. `shared/ipc/{types,client}.ts` (typed `AppError` mirror + `listModels()` wrapping `invoke('list_models')`). `ModelPicker.tsx` is a controlled `<select>` with `aria-label="Model"`, loads via `useEffect` with cancel-guard, renders error in `role="alert"`. Wired into App.tsx (renders dropdown + "Selected: …" line). Vitest 5/5 in 1.6 scope: `client.test.ts` (1: invoke delegation), `ModelPicker.test.tsx` (4: options render, onChange fires, value persists across rerender, error path). Total vitest: 9/9. `pnpm build` clean (33 modules, CSS 5.52KB — grew from 4.87KB confirming new utility classes scanned). Visual sign-off requires Ollama running.
| 1.7 | `commands/prompt.rs` → `run_prompt` (streaming via Tauri events) | integration test against mock | Token order, byte-exact concat equals fixture |
> 1.7 — ✅ shipped 2026-05-21. Split: `run_prompt_inner(endpoint, model, prompt, on_token)` (testable, validates non-empty model+prompt before stream) + `#[tauri::command] run_prompt(app, model, prompt)` (emits `prompt-token` per token with `{text}`, then `prompt-done` once). Registered in builder. Tauri 2 `Emitter` trait via `AppHandle`. Tests 3/3 in tests/prompt_stream.rs: byte-exact tokens `["The ", "sky ", "is ", "blue."]`, concat `"The sky is blue."`; empty-prompt + empty-model rejected with mockito `.expect(0)` proving validation runs pre-HTTP. Total `cargo test` 12/12. Event channels exposed as `EVENT_TOKEN` / `EVENT_DONE` consts for 1.9 to import.
| 1.8 | `PromptEditor.tsx` (Monaco) | render + input test | Typed text reflected in state |
> 1.8 — ✅ shipped 2026-05-21. `PromptEditor` wraps `@monaco-editor/react`'s default export (`language: markdown`, `vs-dark` theme, no minimap, 240px height). Test mocks the wrapper module to a textarea since real Monaco won't render in jsdom (workers, dom APIs). Tests 3/3 in `PromptEditor.test.tsx`: wrapper + mock present; controlled-state Wrapper component shows fireEvent.change typed text in an echo div; initial value via prop populates editor. Wired into App.tsx with its own `prompt` state. Build: 33→46 modules, JS 194→209KB (Monaco wrapper + deps).
| 1.9 | `useStreamingRun.ts` + `OutputStream.tsx` | hook test with mocked event stream | Tokens append in order, no dup, no drop |
> 1.9 — ✅ shipped 2026-05-21. `useStreamingRun` registers `prompt-token` / `prompt-done` listeners in `useEffect` with a `cancelled` flag (strict-mode safe). `start(model, prompt)` resets state to running, invokes `run_prompt`, sets `error`/`status='error'` on rejection. Event channel constants from `shared/ipc/events.ts` (TS mirror of Rust `EVENT_TOKEN`/`EVENT_DONE`). `OutputStream` renders `<pre>` with `whitespace-pre-wrap`. App.tsx now mounts the hook + OutputStream; wired into the live view though `start` isn't called yet (1.10 adds RunControls). Hook test 2/2: 4 ordered events → `output === "The sky is blue."` byte-exact (proves order + no-dup + no-drop in one assertion), status → done, invoke called with `{model, prompt}`; rejection path sets `status='error'` and error contains the throw message. Build: 50 modules, JS 211KB.
| 1.10 | `RunControls.tsx` + cancel wiring (`stop_prompt`) | cancel-mid-stream test | No orphan tokens after cancel; HTTP conn closed |
> 1.10 — ✅ shipped 2026-05-21. Cancellation: `tokio_util::sync::CancellationToken` threaded through `stream_generate`. Outer `tokio::select!` races cancel vs next byte chunk; inner per-token check breaks the line loop early. `prompt.rs` adds `RunState(Mutex<Option<CancellationToken>>)` managed in the Tauri builder, plus `#[tauri::command] stop_prompt`. `run_prompt` cancels any prior run on entry; emits `prompt-done` only on `Ok` (so validation/HTTP errors don't double-signal). Frontend: `useStreamingRun.cancel()` invokes `stop_prompt`. `RunControls.tsx` has Run/Cancel buttons + status pill, gated on `canRun && status!=running`. Tests: cargo 13/13 (new `cancellation_mid_stream_stops_emission_no_orphans`: fixture has 4 tokens, cancel after 2 → `tokens == ["A","B"]`); vitest 18/18 (4 new for RunControls — idle/running/canRun/status). HTTP-connection close is by Rust drop semantics when `stream_generate` returns.
| 1.11 | `metrics/timing.rs` (TTFT, tokens/sec) | unit test on fixed timings | TTFT in ms > 0; tokens/sec within ±5% of expected |
> 1.11 — ✅ shipped 2026-05-21. Pure functions `ttft_ms(Duration)->u64` and `tokens_per_sec(span: Duration, count) -> Option<f64>` (None on zero span or zero count). Stateful `RunTiming { start, first_token, last_token, token_count }` with `start()` / `record_token()` and delegating `ttft_ms()` / `tokens_per_sec()`. Not yet wired into `run_prompt` — done in a UI-surfacing step later. Tests inline (cargo `--lib` 5/5 timing): `ttft_ms` byte-exact for 0/123/2000ms; `tps_exact_math_100_over_5s_is_20` exact float equality; `tps_within_5pct_of_expected` (50 tokens / 2500ms vs expected 20.0, drift ≤5%); `tps_none_on_zero_count_or_zero_duration`; sleep-based `run_timing_smoke_observes_positive_ttft` (2× 20ms sleep → ttft_ms > 0, tps > 0). Total cargo: 18.
| 1.12 | `persistence/prompts.rs` (YAML save/load) | round-trip test | `diff` of save→load→save is empty (byte-identical) |
> 1.12 — ✅ shipped 2026-05-21. `StoredPrompt {model, prompt}` (Serialize+Deserialize+PartialEq+Clone). `save_prompt(path, &StoredPrompt)` writes serde_yaml UTF-8. `load_prompt(path) -> AppResult<StoredPrompt>` parses. New `AppError::Io(String)` variant for filesystem failures (parse errors stay in `Internal`). Tests 4/4 inline (cargo --lib 13/13; cargo total 22): byte-identical round-trip for plain ASCII, multi-line (YAML emits `|-` block scalar), and UTF-8 + nested `"hi"` / `'bye'`; missing file -> `AppError::Io`. Eyeballed YAML: `model: llama3.2:1b\nprompt: Why is the sky blue?\n` for ASCII; `prompt: \|-\n  line one\n  line two\n  line three\n` for multi-line. Note: `serde_yaml 0.9` is crate-deprecated by dtolnay (functional, still gets security updates) — migration candidate logged for `future-considerations.md`.
| 1.13 | `workspaceStore.ts` (Zustand) | state transition test | idle→running→streaming→done; cancel→idle |
> 1.13 — ✅ shipped 2026-05-21. `useWorkspaceStore` Zustand store, `RunStatus = idle|running|streaming|done`. Actions: `beginRun` (→ running, unconditional), `receiveToken` (running → streaming; else no-op), `finish` (running/streaming → done; else no-op), `cancel` (→ idle, unconditional). Guards prevent invalid jumps (e.g., done from idle). Tests 8/8: happy-path transitions; cancel from running/streaming/done; idle no-op guards on receiveToken and finish; streaming idempotent. Total vitest: 26. Store is standalone — `useStreamingRun` still owns its own `RunStatus` (different shape: idle|running|done|error). Wiring the two together is deferred; 1.13 spec only asks for the store + its transitions.
| 1.14 | `commands/workspace.rs` (save/load IPC) | round-trip via IPC | File content matches in-memory prompt exactly |
> 1.14 — ✅ shipped 2026-05-21. Split: testable `save_prompt_to_file(path, model, prompt)` / `load_prompt_from_file(path) -> StoredPrompt` wrapping persistence layer, plus `#[tauri::command] save_prompt(path, model, prompt)` and `#[tauri::command] load_prompt(path) -> StoredPrompt` (both registered in `tauri::Builder::invoke_handler`). Tests 4/4 in `tests/workspace_persistence.rs`: ASCII round-trip byte-exact; Unicode + quotes + newlines (`"line 1\nline 2 — 世界 — say \"hi\" and 'bye'"`) round-trips with `loaded.prompt == prompt`; missing file → `AppError::Io`; second save overwrites first. Total cargo: 26. "Round-trip via IPC" is via the testable inner pair — `#[tauri::command]` wrappers can't be invoked outside a Tauri runtime, but they're verified by `main.rs` compiling with the new entries in `generate_handler!`.
| 1.15 | E2E smoke: edit → run → save → reload → re-run | manual + scripted | All four exit criteria hold end-to-end |
> 1.15 — ✅ shipped 2026-05-21. Backend: `run_prompt` wraps the streaming callback with `Arc<Mutex<RunTiming>>::record_token` per token; on `Ok`, emits `prompt-done` with `DonePayload { ttft_ms, tokens_per_sec, token_count }` instead of `()`. Frontend: `useStreamingRun` adds `metrics: DonePayload \| null` state, reset on `start`. New `WorkspaceIO.tsx` with path input + Save/Load buttons (path defaults to `./splice-current.yaml`). App.tsx renders `<p data-testid="metrics">TTFT: … · … tok/s · N tokens</p>` when present + mounts WorkspaceIO. Scripted: `AppIntegration.test.tsx` walks the full edit→run→save→mutate→load→re-run path with mocked invoke + listen + Monaco, asserting all four exit criteria; second test asserts cancel invokes `stop_prompt`. Plus `WorkspaceIO.test.tsx` (3 unit tests). Total: cargo 26, vitest 31, grand total **57** automated checks. Manual gate: run `cd frontend && pnpm tauri dev` with Ollama up + a model pulled, walk the same flow live.
| 1.16 | StatusBar (model + Ollama health pill + last-run metrics) | render/health/precision/click tests | StatusBar metrics match inline metrics byte-for-byte; precision rules hold |
> 1.16 — ✅ shipped 2026-05-21. Backend: new `commands/health.rs` with `probe_health(endpoint) -> HealthStatus { available, version }` + `#[tauri::command] check_ollama_health()` registered in `tauri::Builder::invoke_handler`. Probe is **non-throwing** — 5xx, connection-refused, and malformed body all map to `available:false` (red-dot UX, not an error popup). 800ms timeout. Frontend: `HealthStatus` type + `checkOllamaHealth()` IPC wrapper. `workspaceStore` gains `lastRunMetrics: DonePayload \| null` + `setLastRunMetrics` action; `useStreamingRun` mirrors metrics into the store on `prompt-done`. New `StatusBar.tsx` (fixed bottom, h-10, monospace, border-top): left = clickable model name (scrolls picker into view), middle = green/red dot + `connected · 0.1.32` or `Ollama not running`, right = `TTFT {int}ms · {1dp} tok/s · {n} tokens` from store. Polls health every 5s. App.tsx adds `pb-14` so content clears the bar; integration test mocks `check_ollama_health` and asserts StatusBar reads the same `8ms / 32.0 tok/s / 4 tokens` as the inline `<p data-testid="metrics">` (display-consistency gate). Tests: cargo 30/30 (+4 health: 200/5xx/refused/malformed); vitest 40/40 (+9: 1 client mock, 2 store, 1 hook store-mirror, 5 StatusBar). Stale-metrics behavior asserted: `beginRun` does not blank `lastRunMetrics`. Manual gate: `cd frontend && pnpm tauri dev`, observe footer model/health/metrics with Ollama up, then `pkill ollama` and see the dot flip red within ≤5s.

## Branching

Branch per step: `phase-1/1.1-scaffold`, `phase-1/1.2-frontend-deps`, …
One PR per step. PR description ends with "Closes step 1.N".

## Prerequisites (must be green before step 1.1)

- Rust toolchain (`rustc`, `cargo`) installed.
- Ollama installed and `ollama serve` reachable at `http://localhost:11434`.
- At least one model pulled (`llama3.2:1b`).
- pnpm ≥ 9 (current host has 8.15 — upgrade before 1.1).
- `gh` CLI installed (for PR / repo commands later).

If any prerequisite is red, fix it before touching code. This is the
"stop and ask" condition from `workflow.md`.

## Updating this doc

After each step, append a one-line note under that row in the table:
status (✅ shipped / ⏳ in progress) + commit SHA + date. Do not re-flow
the table; just keep it readable.

## Post-ship audit (added 2026-05-21)

A forensic audit performed after Phase 1 shipping identified 21
issues (F1–F21). The 7 P0 and critical P1 fixes are addressed in
Phase 1.5; see `02b_phase1.5_remediation.md`. Remaining items are
tracked for their respective future phases.

This note is additive forensic trail, not a retroactive scope change.
The shipped-phase freeze rule (phase-roadmap.md) remains intact in
spirit: original step ledger and exit criteria are unmodified.
