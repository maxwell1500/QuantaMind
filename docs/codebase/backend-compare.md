# Backend — COMPARE (Analysis) subsystem

Run **one prompt across N models side-by-side**, streaming a row per model, with a
hardware-fit pre-flight gate and Markdown/JSON/HTML export.

Cross-links:
- Per-model generation goes through the `InferenceBackend` trait — see
  [`backend-inference-backends.md`](./backend-inference-backends.md).
- The Analysis (Compare) UI that consumes these events — see
  [`frontend-compare-analysis.md`](./frontend-compare-analysis.md).
- The hardware snapshot / disk usage behind feasibility — see
  [`backend-prompt-workspace-system.md`](./backend-prompt-workspace-system.md).

---

## Overview

**Why side-by-side compare.** A user evaluating local models wants the *same*
prompt, *same* system message, and (optionally) the *same* params fed to several
models at once, so quality and speed are directly comparable. Compare fans the
prompt out and emits one independent, streaming row per model.

**What it produces.** Per-model **rows**, each carrying:
- streamed token text (live generation),
- timing metrics — TTFT (time to first token, ms), tokens/sec, token count,
  a per-token `timeline`,
- backend-reported `GenerateStats` (prompt-eval / eval / load / total ms, when known),
- a terminal state: `done`, `cancelled`, or `error`.

Rows are emitted as Tauri events (the runner never touches Tauri — see the sink
below). The frontend assembles the table and the export.

**How (IPC surface).**

| Command | Kind | Purpose |
|---|---|---|
| `run_compare` | async | Validate, build rows, fan out via the chosen strategy. |
| `stop_compare` | sync | Cancel one row (by `model_id`) or the whole run. |
| `save_compare_report` | sync | Write an assembled report to disk (`md`/`json`/`html`). |
| `check_install_feasibility` | async | Pre-flight: does the model fit on disk? |

**Managed state.** `CompareRunState` (Tauri-free domain struct, registered as
Tauri `State`) holds a per-row cancellation-token registry plus a run-level token.
`run_compare` populates it; `stop_compare` drains it.

**Strategy.** `Sequential` (one model at a time, unloads between models by default)
or `Parallel` (all models spawned at once, kept resident by default).

### Compare events emitted to the frontend

| Event const | String | Payload | When |
|---|---|---|---|
| `EVENT_COMPARE_LOADING` | `compare-loading` | `CompareLoadingPayload { model_id, model }` | Row starts, before first token. |
| `EVENT_COMPARE_TOKEN` | `compare-token` | `CompareTokenPayload { model_id, model, text }` | Each streamed token. |
| `EVENT_COMPARE_DONE` | `compare-done` | `CompareDonePayload { model_id, model, ttft_ms?, tokens_per_sec?, token_count, timeline, stats }` | Row completes successfully. |
| `EVENT_COMPARE_CANCELLED` | `compare-cancelled` | `CompareCancelledPayload { model_id, model, token_count }` | Row stopped mid-stream. |
| `EVENT_COMPARE_ERROR` | `compare-error` | `CompareErrorPayload { model_id, model, kind, message }` | Row failed (typed `kind`). |
| `EVENT_COMPARE_RUN_DONE` | `compare-run-done` | `()` | Whole run finished (after all rows). |

All emission funnels through `log_emit` (`commands/emit.rs`), which logs on emit
failure rather than swallowing it (`docs/architecture.md#robustness`).

---

## `backend/src/commands/compare/` — the IPC layer

The thin command shell: validates inputs, builds row specs, wires a Tauri sink,
and dispatches into the pure runner. `mod.rs` exports all five files.

### File: `compare.rs`

- **Responsibility:** The `run_compare` / `stop_compare` Tauri commands plus
  input validation. The only async entry point into a compare run.
- **Why:** Keep IPC concerns (Tauri `State`, `AppHandle`, arg shapes) out of the
  domain runner. This file translates a frontend request into a pure runner call.
- **What:**
  - `run_compare(...)` — validates models+prompt, ensures settings loaded,
    validates every param block up-front (so the per-row options closure stays
    infallible), builds `rows` via `rows_for`, wraps an `Arc<dyn CompareSink>`,
    resolves `keep_alive`, then calls `run_sequential` / `run_parallel`.
  - `stop_compare` / `stop_compare_inner` — cancel one row by parsed `Uuid`, or
    the whole run (take the run token, drain + cancel every row token).
  - `validate(models, prompt)` — empty model list / empty prompt → `AppError::Validation`.
  - Re-exports `CompareRunState` so the app registers it from this module.
- **How/Where used:** Registered in the Tauri command table; invoked from the
  Analysis UI's `invoke("run_compare", …)` / `invoke("stop_compare", …)`.

```rust
#[tauri::command]
pub async fn run_compare(
    app: AppHandle,
    state: tauri::State<'_, CompareRunState>,
    settings: tauri::State<'_, ModelSettingsState>,
    models: Vec<String>, prompt: String, strategy: Strategy,
    system: Option<String>, params: Option<InferenceParams>,
    per_model_params: Option<HashMap<String, InferenceParams>>,
    backends: Option<Vec<BackendKind>>, keep_alive: Option<i32>,
) -> Result<(), AppError> {
    validate(&models, &prompt)?;
    settings.ensure_loaded(&app)?;
    if let Some(p) = &params { validate_params(p)?; }            // fail fast — closure stays infallible
    if let Some(map) = &per_model_params { for p in map.values() { validate_params(p)?; } }
    let backends = backends.unwrap_or_default();
    let rows = rows_for(&models, &backends, |m| {
        Some(options_for(m, params.as_ref(), per_model_params.as_ref(), settings.temperature_for(m)))
    });
    let sink: Arc<dyn CompareSink> = Arc::new(TauriCompareSink::new(app));
    let system_trim = system.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let keep_alive = keep_alive.or(match strategy {                // header toggle wins; else strategy default
        Strategy::Sequential => Some(0), Strategy::Parallel => None,
    });
    match strategy {
        Strategy::Sequential => run_sequential(sink, state.inner(), DEFAULT_OLLAMA, rows, &prompt, system_trim, keep_alive).await,
        Strategy::Parallel   => run_parallel(sink, state.inner(), DEFAULT_OLLAMA, rows, &prompt, system_trim, keep_alive).await,
    }
}
```

`stop_compare_inner` is the cancellation half:

```rust
pub fn stop_compare_inner(state: &CompareRunState, model_id: Option<String>) -> AppResult<()> {
    match model_id {
        Some(id_str) => {
            let id = id_str.parse::<Uuid>().map_err(|e| AppError::Validation(format!("bad model_id: {e}")))?;
            if let Some(token) = state.rows.lock_recover().remove(&id) { token.cancel(); }   // one row
        }
        None => {                                                                            // whole run
            if let Some(t) = state.run_cancel.lock_recover().take() { t.cancel(); }
            for (_, token) in state.rows.lock_recover().drain() { token.cancel(); }
        }
    }
    Ok(())
}
```

Tests (`compare_tests.rs`) assert empty/whitespace prompt and empty model list are
rejected with `Validation`, and that a valid pair passes.

### File: `compare_options.rs`

- **Responsibility:** Resolve one model's `GenerateOptions` from the layered
  param sources.
- **Why:** Precedence (per-model override > shared params > settings temperature)
  is a single decision; isolating it keeps `run_compare` flat.
- **What:** `options_for(model, params, per_model, temp) -> GenerateOptions` —
  picks the per-model entry if present else the shared `params`, converts via
  `to_generate_options`, and back-fills temperature from the per-model setting
  only when still unset.
- **How/Where used:** Called once per model inside `run_compare`'s `rows_for`
  closure.

```rust
pub fn options_for(model: &str, params: Option<&InferenceParams>,
                   per_model: Option<&HashMap<String, InferenceParams>>, temp: f32) -> GenerateOptions {
    let p = per_model.and_then(|map| map.get(model)).or(params);   // override > shared
    let mut opts = p.map(to_generate_options).unwrap_or_default();
    if opts.temperature.is_none() { opts.temperature = Some(temp); }  // settings fallback
    opts
}
```

Tests confirm a per-model entry overrides shared params, and temperature falls
back to the settings value when no params are supplied.

### File: `compare_payloads.rs`

- **Responsibility:** Wire shapes — the six `EVENT_COMPARE_*` string constants,
  one serializable payload struct per event, and the `Strategy` enum.
- **Why:** The event contract lives in exactly one place; sink and frontend both
  reference these names/shapes.
- **What:** `CompareLoadingPayload`, `CompareTokenPayload`, `CompareDonePayload`
  (the full per-row metric bundle), `CompareCancelledPayload`,
  `CompareErrorPayload`; `Strategy { Sequential, Parallel }` (`snake_case`);
  `RunCompareArgs` (deserialize helper). See the event table above for fields.

### File: `compare_sink.rs`

- **Responsibility:** The IPC implementation of the domain `CompareSink` trait —
  `TauriCompareSink`.
- **Why:** **Separation of concerns.** The runner emits *domain* events through
  the `CompareSink` trait and never imports Tauri. This struct is the single seam
  where compare events meet the IPC layer (`docs/architecture.md#layering`).
- **What:** `TauriCompareSink { app: AppHandle }` implementing every trait method
  by building the matching payload and calling `log_emit`.
- **How/Where used:** Constructed in `run_compare`, boxed as `Arc<dyn CompareSink>`,
  passed down to the runner.

```rust
impl CompareSink for TauriCompareSink {
    fn loading(&self, model_id: &str, model: &str) {
        log_emit(&self.app, EVENT_COMPARE_LOADING, CompareLoadingPayload {
            model_id: model_id.into(), model: model.into() });
    }
    fn done(&self, model_id: &str, model: &str, ttft_ms: Option<u64>, tokens_per_sec: Option<f64>,
            token_count: usize, timeline: &[TokenTiming], stats: &GenerateStats) {
        log_emit(&self.app, EVENT_COMPARE_DONE, CompareDonePayload {
            model_id: model_id.into(), model: model.into(), ttft_ms, tokens_per_sec, token_count,
            timeline: timeline.to_vec(), stats: stats.clone() });
    }
    fn run_done(&self) { log_emit(&self.app, EVENT_COMPARE_RUN_DONE, ()); }
    // token / cancelled / error: same pattern → their respective payloads
}
```

### File: `compare_export.rs`

- **Responsibility:** Persist an already-assembled report string to disk.
- **Why:** The frontend builds the Markdown/JSON/HTML body (it has the rows); the
  backend owns only the disk write + format gate. (Tauri file I/O belongs in Rust
  — see `docs/architecture.md`.)
- **What:** `save_compare_report(path, format, contents)` → `save_inner` —
  rejects empty path and any format outside `md | json | html`, then
  `fs::write`. IO failure maps to `AppError::Io`.
- **How/Where used:** Invoked when the user clicks export in the Analysis UI.

```rust
pub fn save_inner(path: &str, format: &str, contents: &str) -> AppResult<()> {
    if path.trim().is_empty() { return Err(AppError::Validation("path is empty".into())); }
    if !matches!(format, "md" | "json" | "html") {
        return Err(AppError::Validation(format!("unknown format: {format}")));
    }
    fs::write(Path::new(path), contents).map_err(|e| AppError::Io(format!("write {path}: {e}")))?;
    Ok(())
}
```

Test: unknown format is rejected; `html` is accepted and round-trips on disk.

### File: `mod.rs`

- **Responsibility:** Declare the five compare command modules. No logic.

---

## `backend/src/inference/compare/` — the pure runner

Tauri-free domain logic: build rows, fan them out, stream tokens through the
sink, finalize. Depends on the `CompareSink` trait — never on the IPC layer.

### File: `compare_runner.rs`

- **Responsibility:** The `RowSpec` shape, row construction (`rows_for`), and the
  two fan-out strategies (`run_sequential`, `run_parallel`).
- **Why:** Each model is an independent unit of work bound to its own backend
  (a backend is coupled to the model's weight format — auto-picked, never a health
  fallback). The runner orchestrates these units and is pure for testability.
- **What:**
  - `RowSpec { model_id: Uuid, model, options, backend }` — one row's plan.
  - `rows_for(models, backends, options_for)` — one `RowSpec` per model;
    `backends` is *parallel* to `models`, a missing/short entry falls back to
    `BackendKind::default()` (Ollama).
  - `run_sequential` — installs a run token, loops rows, breaks on cancel, awaits
    each row, clears state, emits `run_done`.
  - `run_parallel` — installs a run token, `tokio::spawn`s every row at once,
    joins handles (a panicked task emits a synthetic `error` row), clears, emits
    `run_done`.
- **How/Where used:** `rows_for` is called in `run_compare`; `run_*` are the two
  match arms of the strategy dispatch.

```rust
#[derive(Clone)]
pub struct RowSpec { pub model_id: Uuid, pub model: String,
                     pub options: Option<GenerateOptions>, pub backend: BackendKind }

pub fn rows_for(models: &[String], backends: &[BackendKind],
                options_for: impl Fn(&str) -> Option<GenerateOptions>) -> Vec<RowSpec> {
    models.iter().enumerate().map(|(i, m)| RowSpec {
        model_id: Uuid::new_v4(), model: m.clone(), options: options_for(m),
        backend: backends.get(i).copied().unwrap_or_default(),    // short list → Ollama
    }).collect()
}
```

The sequential loop (note the per-iteration cancel check and the terminal
`run_done`):

```rust
pub async fn run_sequential(sink: Arc<dyn CompareSink>, state: &CompareRunState, endpoint: &str,
        rows: Vec<RowSpec>, prompt: &str, system: Option<&str>, keep_alive: Option<i32>) -> Result<(), AppError> {
    let run_cancel = CancellationToken::new();
    *state.run_cancel.lock_recover() = Some(run_cancel.clone());
    for row in &rows {
        if run_cancel.is_cancelled() { break; }
        run_one_row(&sink, state, endpoint, row, prompt, system, keep_alive).await;
    }
    *state.run_cancel.lock_recover() = None;
    state.rows.lock_recover().clear();
    sink.run_done();
    Ok(())
}
```

The parallel fan-out spawns one task per row and joins; a panic becomes an
`error` event so a row never silently disappears:

```rust
let handles: Vec<_> = rows.into_iter().map(|row| {
    let (id, model) = (row.model_id.to_string(), row.model.clone());
    let (sink, state) = (sink.clone(), state.clone());
    let (endpoint, prompt, system) = (endpoint.clone(), prompt.clone(), system.clone());
    let handle = tokio::spawn(async move {
        run_one_row(&sink, &state, &endpoint, &row, &prompt, system.as_deref(), keep_alive).await;
    });
    (id, model, handle)
}).collect();
for (id, model, handle) in handles {
    if let Err(e) = handle.await {
        eprintln!("compare row '{model}' task panicked: {e}");
        sink.error(&id, &model, "internal", "row task panicked");
    }
}
```

Test asserts `rows_for` assigns each model its own backend, defaulting the
overflow entry to Ollama.

### File: `compare_run_row.rs`

- **Responsibility:** Drive **one** row end-to-end: register its cancel token,
  emit `loading`, set up timed token streaming, dispatch to the model's backend,
  then finalize.
- **Why:** A row is the natural unit shared by both strategies; this is where the
  `InferenceBackend` trait is actually invoked.
- **What:**
  - `endpoint_for(ollama_endpoint, backend)` — Ollama uses the run endpoint;
    llama.cpp uses its sidecar default; MLX resolves the app-managed server's
    dynamic port (or :8082 manual default) via `mlx_endpoint()`.
  - `run_one_row(...)` — inserts a fresh `CancellationToken` into `state.rows`
    keyed by `model_id`, emits `loading`, wraps a `make_token_handler` (counts +
    times each token, cancels on emit failure), builds a `GenerateSpec`, and
    matches `row.backend` to call `OllamaBackend` / `LlamaCppBackend` /
    `MlxBackend`. On return it removes the row token and calls `finalize_row`.
- **How/Where used:** Called by both `run_sequential` and (spawned) `run_parallel`.

```rust
pub(crate) async fn run_one_row(sink: &Arc<dyn CompareSink>, state: &CompareRunState,
        endpoint: &str, row: &RowSpec, prompt: &str, system: Option<&str>, keep_alive: Option<i32>) {
    let row_token = CancellationToken::new();
    state.rows.lock_recover().insert(row.model_id, row_token.clone());   // registry → stoppable
    let id_str = row.model_id.to_string();
    sink.loading(&id_str, &row.model);
    let timing = Arc::new(Mutex::new(RunTiming::start()));
    let handler = make_token_handler(move |t| { sink_for_token.token(&id_for_token, &model_for_token, t); Ok(()) },
                                     row_token.clone(), timing.clone());
    let spec = GenerateSpec { model: row.model.clone(), prompt: prompt.to_string(),
                              system: system.map(str::to_string), options: row.options.clone(), keep_alive };
    let row_endpoint = endpoint_for(endpoint, row.backend);
    let result = match row.backend {                                    // backend ↔ weight format
        BackendKind::Ollama  => OllamaBackend::new(row_endpoint).generate(&spec, row_token.clone(), handler).await,
        BackendKind::LlamaCpp => LlamaCppBackend::new(row_endpoint).generate(&spec, row_token.clone(), handler).await,
        BackendKind::Mlx     => MlxBackend::new(row_endpoint, row.model.clone()).generate(&spec, row_token.clone(), handler).await,
    };
    state.rows.lock_recover().remove(&row.model_id);
    finalize_row(sink.as_ref(), row, &timing, &row_token, result);
}
```

`generate(&spec, token, handler)` is the shared `InferenceBackend` trait method —
see [`backend-inference-backends.md`](./backend-inference-backends.md). Tests
assert the endpoint routing per backend (Ollama keeps the run endpoint; llama.cpp
and MLX ignore it).

### File: `compare_runner_finalize.rs`

- **Responsibility:** Translate a row's `Result<GenerateStats, AppError>` into the
  single terminal sink call (`done` / `cancelled` / `error`).
- **Why:** Terminal-state classification is its own concern; keeping it out of
  `run_one_row` keeps the dispatch readable.
- **What:**
  - `finalize_row(sink, row, timing, row_token, result)` — `Ok` **and** the token
    is cancelled → `cancelled` (a stopped row still produced partial output);
    plain `Ok(stats)` → `done` with the full timing bundle; `Err` → `error`.
  - `app_error_split(&AppError) -> (kind, message)` — maps each `AppError`
    variant to a stable string `kind` the frontend can branch on.
- **How/Where used:** Tail call of `run_one_row`.

```rust
pub(crate) fn finalize_row(sink: &dyn CompareSink, row: &RowSpec, timing: &Arc<Mutex<RunTiming>>,
        row_token: &CancellationToken, result: Result<GenerateStats, AppError>) {
    let id = row.model_id.to_string();
    match result {
        Ok(_) if row_token.is_cancelled() => sink.cancelled(&id, &row.model, timing.lock_recover().token_count),
        Ok(stats) => {
            let t = timing.lock_recover();
            sink.done(&id, &row.model, t.ttft_ms(), t.tokens_per_sec(), t.token_count, t.timeline(), &stats);
        }
        Err(err) => { let (kind, message) = app_error_split(&err); sink.error(&id, &row.model, &kind, &message); }
    }
}
```

`RunTiming` (from `metrics/timing.rs`) supplies `ttft_ms()`, `tokens_per_sec()`,
`token_count`, and `timeline()`; `GenerateStats` carries backend-reported ms
fields, all `Option` — `None` means "not measured", never a fabricated zero
(`docs/architecture.md#robustness`).

### File: `compare_sink.rs`

- **Responsibility:** Define the domain `CompareSink` trait — the runner's only
  output channel.
- **Why:** Inverts the dependency: the runner depends on this trait, the IPC layer
  implements it. `Send + Sync` so a sink can cross `tokio::spawn` in parallel mode.
- **What:** Trait `CompareSink` with `loading`, `token`, `done` (full metric
  signature), `cancelled`, `error`, `run_done`.
- **How/Where used:** Implemented by `commands/compare/compare_sink.rs`
  (`TauriCompareSink`); consumed throughout the runner as `Arc<dyn CompareSink>`.

### File: `compare_state.rs`

- **Responsibility:** Hold per-run cancellation tokens.
- **Why:** `stop_compare` and the run loop must share the same registry to cancel
  in-flight rows. Tauri-free so the domain stays portable; the IPC layer registers
  it as Tauri `State` and re-exports it from `commands::compare::compare`.
- **What:** `CompareRunState { rows: Arc<Mutex<HashMap<Uuid, CancellationToken>>>,
  run_cancel: Arc<Mutex<Option<CancellationToken>>> }` — `Default + Clone` (cloned
  cheaply into each spawned parallel task).
- **How/Where used:** Populated by `run_one_row` (insert/remove per row) and the
  `run_*` functions (run token); drained by `stop_compare_inner`.

```rust
#[derive(Default, Clone)]
pub struct CompareRunState {
    pub rows: Arc<Mutex<HashMap<Uuid, CancellationToken>>>,
    pub run_cancel: Arc<Mutex<Option<CancellationToken>>>,
}
```

### File: `mod.rs`

- **Responsibility:** Declare the five runner modules. No logic.

---

## Feasibility — `backend/src/commands/system/feasibility.rs`

Compare's pre-flight gate: before a user installs/launches a model to compare,
check it fits on disk. (The hardware/`system` snapshot itself is documented in
[`backend-prompt-workspace-system.md`](./backend-prompt-workspace-system.md);
this section covers only the disk-fit decision.)

- **File:** `backend/src/commands/system/feasibility.rs`
- **Responsibility:** Decide whether a model of a given estimated size can be
  installed without starving the disk, and expose it as a command.
- **Why:** Downloading a model that won't fit wastes bandwidth and can wedge the
  machine; this gates the install before the compare flow can use the model.
- **What:**
  - `InstallFeasibility` enum (`#[serde(tag = "kind")]`): `Ok`,
    `Warning { free_after_bytes }`,
    `BlockedInsufficientSpace { free_after_bytes, free_bytes, needed_bytes }`.
  - Thresholds: `BLOCK_THRESHOLD_BYTES` = 2 GB (block below), `WARN_THRESHOLD_BYTES`
    = 10 GB (warn below), `SAFETY_MARGIN_PCT` = 5% added to the estimate (Ollama's
    catalog size is an approximation).
  - `assess(free_bytes, estimated_bytes)` — pure, sysinfo-free decision (margin
    computed via `u128` so the multiply can't lose precision). `estimated == 0` →
    `Warning` (unknown size).
  - `check_install_feasibility(estimated_size_bytes)` — command: reads real free
    space via `compute_disk_usage(&models_dir(), 0)` then delegates to `assess`.
- **How/Where used:** Called from the install/compare UI before download; the
  typed `kind` lets the frontend block or warn.

```rust
pub fn assess(free_bytes: u64, estimated_bytes: u64) -> InstallFeasibility {
    if estimated_bytes == 0 { return InstallFeasibility::Warning { free_after_bytes: free_bytes }; }
    let margin = u64::try_from((estimated_bytes as u128 * SAFETY_MARGIN_PCT as u128) / 100u128).unwrap_or(u64::MAX);
    let needed = estimated_bytes.saturating_add(margin);
    let free_after = free_bytes.saturating_sub(needed);
    if free_after < BLOCK_THRESHOLD_BYTES {
        InstallFeasibility::BlockedInsufficientSpace { free_after_bytes: free_after, free_bytes, needed_bytes: needed }
    } else if free_after < WARN_THRESHOLD_BYTES {
        InstallFeasibility::Warning { free_after_bytes: free_after }
    } else { InstallFeasibility::Ok }
}
```

---

## Data-flow walkthrough

**User picks 3 models + a prompt → feasibility → run_compare fans out → per-model
row events → finalize → export.**

1. **Pre-flight (per model).** For any model not yet installed, the UI calls
   `check_install_feasibility(estimated_size_bytes)` → `assess`. `Ok` proceeds;
   `Warning` proceeds with a notice; `BlockedInsufficientSpace` halts before
   download.
2. **Launch.** UI invokes `run_compare(models=[A,B,C], prompt, strategy,
   system?, params?, per_model_params?, backends?, keep_alive?)`.
3. **Validate + build.** `run_compare` rejects empty model list / blank prompt,
   validates every param block, then `rows_for` produces three `RowSpec`s — each
   with a fresh `model_id` (Uuid), resolved `options_for` (override > shared >
   settings temp), and its parallel `backend` (default Ollama).
4. **Wire the sink.** A `TauriCompareSink` is boxed as `Arc<dyn CompareSink>`;
   `keep_alive` resolves from the header toggle else the strategy default.
5. **Fan out.** `Sequential` runs rows one at a time (unload between, `keep_alive=0`);
   `Parallel` spawns all three (resident, `keep_alive=None`). Both install a
   run-level cancel token in `CompareRunState`.
6. **Per row (`run_one_row`).** Register the row's cancel token → emit
   **`compare-loading`** → stream generation through the matched `InferenceBackend`,
   each token emitting **`compare-token`** while `RunTiming` records TTFT / count /
   timeline → remove the row token.
7. **Finalize (`finalize_row`).** Cancelled mid-stream → **`compare-cancelled`**
   (with partial token count); success → **`compare-done`** (ttft, tokens/sec,
   token_count, timeline, `GenerateStats`); failure → **`compare-error`** (typed
   `kind` + message).
8. **Stop (optional).** `stop_compare(model_id)` cancels one row's token;
   `stop_compare(None)` takes the run token and drains every row token.
9. **Run end.** After all rows resolve, the runner clears state and emits
   **`compare-run-done`**; the UI knows the table is final.
10. **Export.** The frontend assembles a Markdown/JSON/HTML report from the
    collected rows and calls `save_compare_report(path, format, contents)` →
    `save_inner` validates the format and writes the file.
