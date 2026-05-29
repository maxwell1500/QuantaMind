# Compare (multi-model)

> **v0.3 update — run in the Workspace, analyze in Analysis.** Multi-model
> comparison runs **in the Workspace**: the model picker is multi-select for
> Ollama (1 = single run, 2+ = compare with a sequential/parallel picker) and
> single-select for llama.cpp. There is one shared system + user prompt and one
> **Play/Stop** control in the header next to History; per-model outputs stream
> into side-by-side columns (`MultiRun` → `CompareColumn`). The **Analysis** tab
> (`features/compare/components/AnalysisTab.tsx`) is read-only: tok/s + TTFT bar
> charts (3.6), the two-model word diff (3.5), and Markdown/JSON export with a
> quantamind.co footer (3.8). The engine (`assessStrategies` + `run_compare`) is
> unchanged. See `phase-3-bench.md` and `workspaces.md`.

The flow: pick model(s) in the Workspace, write one prompt, hit Play, watch
output stream per model, then open Analysis to compare metrics + diff and export.

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
