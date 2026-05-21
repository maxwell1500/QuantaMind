

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
| 1.6 | `shared/ipc/client.ts` + `ModelPicker.tsx` | Vitest behavior test | Dropdown shows real Ollama models, selection persists |
| 1.7 | `commands/prompt.rs` → `run_prompt` (streaming via Tauri events) | integration test against mock | Token order, byte-exact concat equals fixture |
| 1.8 | `PromptEditor.tsx` (Monaco) | render + input test | Typed text reflected in state |
| 1.9 | `useStreamingRun.ts` + `OutputStream.tsx` | hook test with mocked event stream | Tokens append in order, no dup, no drop |
| 1.10 | `RunControls.tsx` + cancel wiring (`stop_prompt`) | cancel-mid-stream test | No orphan tokens after cancel; HTTP conn closed |
| 1.11 | `metrics/timing.rs` (TTFT, tokens/sec) | unit test on fixed timings | TTFT in ms > 0; tokens/sec within ±5% of expected |
| 1.12 | `persistence/prompts.rs` (YAML save/load) | round-trip test | `diff` of save→load→save is empty (byte-identical) |
| 1.13 | `workspaceStore.ts` (Zustand) | state transition test | idle→running→streaming→done; cancel→idle |
| 1.14 | `commands/workspace.rs` (save/load IPC) | round-trip via IPC | File content matches in-memory prompt exactly |
| 1.15 | E2E smoke: edit → run → save → reload → re-run | manual + scripted | All four exit criteria hold end-to-end |

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
