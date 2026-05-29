# Compare (multi-model)

> **v0.3 update — configure in the Workspace, run into Analysis.** The Workspace
> is config-only: pick model(s) (Ollama multi-select; llama.cpp single), set
> parameters (shared, or per-model via the "same for all" toggle), write one
> system + user prompt, hit **Run**. Run navigates to the read-only **Analysis**
> tab (`AnalysisTab.tsx`): per-model responses (M1/M2/M3) on top, then the tok/s
> + TTFT charts (3.6), the two-model diff (3.5), and MD/JSON export with a
> quantamind.co footer (3.8). The header's single **Start/Stop** next to History
> controls the active backend's *server* (`ServerControl`), not the prompt.
> Per-model params + the shared prompt thread through `run_compare`
> (`options_for`); the engine (`assessStrategies` + `run_compare`) is otherwise
> unchanged. See `phase-3-bench.md` and `workspaces.md`.

## Run strategies

All three are always shown so users can compare verdicts before
choosing. The Run button re-validates feasibility at click time and
rejects with a friendly error on `wont_fit`.

- **Sequential** — one row at a time. Memory needed: `max(model_size)`.
- **Parallel** — all rows fire concurrently via `tokio::spawn` +
  `join_all`. Ollama serializes internally so wall-clock isn't faster
  than sequential; the win is honest about issue-time and lays the
  wiring for when a non-Ollama backend lands. Memory needed:
  `sum(model_size)`.
- **Sequential w/ skip** — same loop as Sequential; UI exposes a Skip
  button per running row that calls `stop_compare(model_id)`. The
  orchestrator's main loop advances past a cancelled row.

## Hardware feasibility formula

`features/compare/state/strategy.ts`:

```
required(model)        = ceil(size_bytes × 1.3)         // runtime > on-disk
sequential / skippable = max(required)
parallel               = sum(required)

verdict = need > avail        ? "wont_fit"
        : need > avail × 0.7  ? "risky"
                              : "ok"
```

`available_memory_bytes` comes from `get_hardware_snapshot`
(`sysinfo::System` memory refresh). On macOS aarch64 the readout is
labelled "Unified memory"; no discrete-VRAM probe.

## Event-bus shape

Backend emits five `compare-*` events. The frontend bus
(`features/compare/state/compareEventBus.ts`) follows the
`downloadEventBus` singleton pattern: idempotent `listen()` at module
scope, dispatch into Zustand. Every payload carries `model_id` (a UUID
the orchestrator generates per row at invoke time) plus `model` (human
name), so re-selecting the same model in a future run can't collide
with stale events.

- `compare-token` — `{model_id, model, text}` per streamed chunk
- `compare-done`  — `{model_id, model, ttft_ms, tokens_per_sec, token_count}`
- `compare-cancelled` — `{model_id, model, token_count}`
- `compare-error` — `{model_id, model, kind, message}` (AppError shape)
- `compare-run-done` — terminator; finishRun() flips any still-pending
  rows to `cancelled`

## Export

`buildReport({prompt, strategy, hardwareSnapshot, selectedModels, rows})`
projects the store snapshot into a stable `CompareReport` value at
click time. `toMarkdown(report)` and `toJson(report)` are pure
functions of that value, so streaming after the user clicks Export
doesn't mutate what was saved.

The frontend asks for a destination via plugin-dialog `save()`, then
calls backend `save_compare_report(path, format, contents)` which
validates and writes the file. User-cancelled saves are silent no-ops;
write failures surface as inline errors via `formatIpcError`.

## Files

- Backend: `commands/{compare,compare_payloads,compare_export,hardware}.rs`,
  `inference/{compare_runner,compare_runner_finalize}.rs`.
- Frontend: `features/compare/` (components, hooks, state, format,
  __tests__), `shared/ipc/{compare,compare_events,hardware}.ts`,
  `shared/format/bytes.ts`.

## Out of scope

- Discrete VRAM detection on NVIDIA / AMD (Apple Silicon unified memory
  only).
- Persistent history of past compare runs (users save reports
  themselves).
- llama_cpp / MLX backends — Compare currently routes everything through
  Ollama. When a second backend lands, parallel becomes wall-clock-faster.
- Per-model parameter variation (temperature, top_p) — model selection
  only.
