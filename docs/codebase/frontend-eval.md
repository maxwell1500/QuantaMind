# Frontend — The Eval Tab

The largest frontend feature. Lives under `frontend/src/features/eval/`. It scores
**local LLMs** on tool-calling and agentic ability and surfaces the results that
downstream features (Agent-Readiness verdicts, Quant) consume.

Cross-links:
- Backend scoring engine → [`backend-eval-engine.md`](./backend-eval-engine.md)
- Result persistence (collections, run logs, cliff store) → [`backend-persistence.md`](./backend-persistence.md)
- Consumers of eval results (readiness gauge, quant) → [`frontend-inspector-quant-agentreport.md`](./frontend-inspector-quant-agentreport.md)
- App shell / nav / stores → [`frontend-overview.md`](./frontend-overview.md)

---

## Overview

**Why.** A model that passes a chat benchmark can still be useless as an *agent*:
it emits malformed tool JSON, calls the wrong tool, loops forever, hallucinates
"done", or degrades as the context fills. The Eval tab measures exactly those
failure modes on the user's own machine, against the user's own models, with no
fabricated numbers (every "N/A"/"—" is a real absence, never a faked 0).

**Modes.** All run over a *collection* of `ToolTask`s (a curated built-in preset
or a user-authored custom set):

| Mode | What it measures | Where |
|---|---|---|
| **Tool-call (single-turn)** | One prompt → one (or parallel) tool call. Parse / tool-match / args-match / abstain sub-scores → `composite`. | matrix grid, scoreboard, PipelinePanel trace |
| **Agentic (multi-step)** | A sandbox loop: model calls tools until an end-state, with injected faults. `Pass^k` (all k runs pass), avg steps, effort (tokens), schema-resilience, top-error. | scoreboard, TraceDebugger / TrajectoryInspector |
| **Matrix (across models)** | Run a whole collection across many target models → one row per model, compared side-by-side. | PerformanceMatrix / MatrixPanel |
| **Context-cliff** | Pad the context to growing depths, find where tool-call accuracy collapses. Feeds the readiness verdict. | ContextCliffPanel + Chart (Audit tab) |
| **Custom collections + CSV** | Author tasks in-app; import single-turn cases from CSV; import/export JSON. | EvalManager, CollectionEditor, CsvImportModal |

**How.** Every panel is a thin React shell over a Tauri IPC command in
`shared/ipc/eval/*`. Long runs stream Tauri **events** (`batch-progress`,
`agentic-step`, `batch-complete`, `cliff-progress`, `cliff-step`) into a Zustand store; the
heavy report lands once on completion. Crash-recovery (`check_unfinished_run` →
`resume_batch_eval`) lets an interrupted batch resume.

### Panel → IPC → store map

| Panel / group | Shows | IPC command(s) | Store |
|---|---|---|---|
| **EvalPage** | The Eval-tab layout (Manager + Scoreboard + TraceDebugger + PerformanceMatrix) | — (orchestrates) | all four |
| **EvalManager** | Collection picker, model, k / maxSteps, native-FC toggle, Run/Stop, New/Edit/Import/Export | `run_batch_eval` / `stop_batch_eval` (via `useBatchRun`) | `evalRegistryStore`, `batchStore` |
| **MatrixScoreboard** ("Simulator") | Per-task Pass/Fail/Partial table + live progress for the focused model | reads streamed events | `batchStore`, `evalRegistryStore` |
| **TraceDebugger** ("Evaluator") | One (model,task) pipeline: Config→System→Stream→Verify + agentic step timeline | reads cached outcome/steps | `batchStore`, `evalRegistryStore` |
| **PerformanceMatrix** | One row per model: Pass^k, native FC, avg-steps, effort, schema-resil, **cliff depth**, top-error | reads `report`; pre-fills cliff | `batchStore`, `cliffStore` |
| **CollectionEditor** | Task list + Task/Sandbox configurator (authoring) | registry CRUD (via store) | `evalRegistryStore` |
| **CsvImportModal** | Live-validated CSV → tasks | `read_text_capped`, `import`/`save_custom_collection` | `evalRegistryStore` |
| **ContextCliffPanel** + Chart | Cliff probe controls, rung table, accuracy-vs-depth chart | `run_context_cliff` / `stop_context_cliff` / `get_cliff_results` | `cliffStore` |
| **RunRecoveryDialog** | Resume/Discard an interrupted batch | `check_unfinished_run` / `resume_batch_eval` / `discard_run` | `batchStore` |
| **PipelinePanel** *(standalone)* | Single-task Config→System Pkg→Stream→Verify stepper | `trace_toolcall_task` / `load_toolcall_trace` | `evalRegistryStore` |
| **MatrixPanel / MatrixGrid** *(standalone)* | Tasks×models P/T/A grid + regression timeline | `run_collection_matrix` / `load_collection_history` | `evalRegistryStore` |
| **ToolCallPanel** *(standalone)* | Batch scoreboard + bar chart | `run_toolcall_eval` | `batchStore`, `evalRegistryStore` |

> **Hosting note.** The *live* Eval-tab tree is `EvalPage → EvalManager +
> MatrixScoreboard + TraceDebugger + PerformanceMatrix`. `ContextCliffPanel`
> lives on the **Audit** tab (`features/audit/AuditPage`). `PipelinePanel`,
> `MatrixPanel`/`MatrixGrid`, `ToolCallPanel`, `TrajectoryInspector`,
> `TaskDetailView` are self-contained composables (alternate/legacy surfaces over
> the same IPC) not wired into the current `EvalPage`; they remain documented as
> the canonical single-task/matrix/agentic renderers.

### Full IPC surface (`shared/ipc/eval/*`)

| Wrapper | Command | Args → Returns |
|---|---|---|
| `runBatchEval` / `stopBatchEval` (`batch.ts`) | `run_batch_eval` / `stop_batch_eval` | `(collectionId, targets, tasks, k?, maxSteps?, params?, keepAlive?, runNativeFc?)` → `BatchReport` |
| `runContextCliff` / `stopContextCliff` (`cliff.ts`) | `run_context_cliff` / `stop_context_cliff` | `(model, backend, collectionId, tasks, source, maxTokens, steps, params?, runId)` → `CliffReport` |
| `saveCliffResult` / `getCliffResults` | `save_cliff_result` / `get_cliff_results` | → `void` / `Record<model, CliffStatus>` |
| `runEvalTask` / `listEvals` (`evals.ts`) | `run_eval_task` / `list_evals` | `(taskId, model, backend)` → `EvalRunResult` |
| `runCollectionMatrix` / `loadCollectionHistory` (`matrix.ts`) | `run_collection_matrix` / `load_collection_history` | → `MatrixReport` / `RunSummary[]` |
| `checkUnfinishedRun` / `resumeBatchEval` / `discardRun` (`queue.ts`) | `check_unfinished_run` / `resume_batch_eval` / `discard_run` | → `UnfinishedRun?` / `BatchReport` / `void` |
| registry CRUD (`registry.ts`) | `list_builtin_collections`, `get_builtin_collection`, `list_custom_collections`, `load_custom_collection`, `save_custom_collection`, `delete_custom_collection`, `import_custom_collection`, `read_text_capped` | collections + tasks |
| `runToolcallEval` / `traceToolcallTask` / `loadToolcallTrace` (`toolcall.ts`) | `run_toolcall_eval` / `trace_toolcall_task` / `load_toolcall_trace` | → `ToolCallReport` / `TraceResult` |
| `assessReadiness` etc. (`readiness.ts`) | `assess_readiness`, profile CRUD | → consumed by readiness, see cross-link |

**Tauri event channels** (push, from `batch.ts` / `cliff.ts`):
`batch-progress` (`BatchProgress`), `agentic-step` (`AgenticStepPayload`),
`batch-complete` (`{report}`), `cliff-progress` (`CliffProgress`),
`cliff-step` (`CliffStep` — per-task sub-rung progress for the live line + ETA).

---

## `components/` — top-level

### EvalPage.tsx — the page

**Responsibility.** Owns the Eval-tab two-column layout and the cross-cutting
**context-shift cancellation law**. **Why it matters:** it is the single place
that decides what "the current eval context" is (backend × collection × model)
and halts everything when that context changes.

**What.** Left column (360px): `EvalManager`. Right column: in **run mode**
`MatrixScoreboard` (over `TraceDebugger`) + `PerformanceMatrix`; in **edit mode**
`CollectionEditor`. It also mounts `RunRecoveryDialog` (via `useRunRecovery`).

**How / where used.** A backend OR collection switch invalidates every running
process for the old context, so `haltOldContext` stops the batch, resets the
batch store, and bumps the cliff generation token:

```tsx
const haltOldContext = () => {
  if (useBatchStore.getState().running) void stopBatchEval();
  useBatchStore.getState().reset();
  useCliffStore.getState().stop();
};
useEffect(() => { haltOldContext(); setFocusedModel(""); }, [selectedBackend]);
useEffect(() => { haltOldContext(); setFocusedTaskId(null); }, [selectedCollection]);
```

The eval runs **one** model, kept a valid member of the *global* selection
(`selectedModelStore`) — no per-page picker. `focusedModel`/`focusedTaskId` drive
which (model,task) the scoreboard/trace inspect; clicking a matrix row scrolls
the detail panels into view.

### TraceDebugger.tsx — the live single-(model,task) inspector ("Evaluator")

**Responsibility.** The replayable pipeline for **one** cell of the batch.
Reads `outcomeByKey[cellKey(model,taskId)]` and `stepsByKey[...]` from
`batchStore` and renders `ConfigPhase` (prompt + tools) → `SystemMessagePhase`
(system pkg + user prompt) → Stream → `VerifyPhase` (pass/fail diagnosis), plus
an **inline agentic step timeline** for multi-step outcomes. Uses `traceDiag`
(from `verdict.ts`) for the failure explanation. Tabs + collapse toggle.

### EvalRow / ToolCallPanel / ContextCliffPanel / CpuFallbackBanner / RunRecoveryDialog

| File | One-line |
|---|---|
| `EvalRow.tsx` | One task row (id, category, pass/fail badge, detail); pure props. |
| `ToolCallPanel.tsx` *(standalone)* | Batch scoreboard (task table + bar chart + stats + run controls) over `run_toolcall_eval`; `batchStore` + `evalRegistryStore` + `installedModelsStore`. |
| `CpuFallbackBanner.tsx` | Warns when Ollama weights spill to CPU; reads `loadedModels()` + hardware snapshot. |
| `RunRecoveryDialog.tsx` | Modal "Resume interrupted evaluation?" — Resume (keeps data) / Discard (destructive) / Esc-dismiss. Renders `run.collection_id` + `done/total`. |
| `ContextCliffPanel.tsx` | The full cliff probe — see [Context-cliff](#contextcliff-folder). |

---

## `hooks/` — the run engines

### useBatchRun.ts — the batch event loop

**Responsibility.** Drives one batch over a **single** Tauri event stream.
Subscribes ONCE (on mount) to all three batch channels, validates each payload
with a Zod schema (drift is logged, never crashes), and routes into the
rAF-buffered `batchStore`. Also flushes the store if the installed-model *set*
changes (but never mid-run).

**Why.** Centralizes the subscription so no component double-listens, and
pre-flights every backend the run uses so a down server fails fast.

```ts
listen(EVENT_BATCH_PROGRESS, (e) => {
  const r = BatchProgressSchema.safeParse(e.payload);
  if (r.success) useBatchStore.getState().ingestProgress(r.data);
  else console.error("IPC payload drift (batch-progress):", r.error.issues, e.payload);
});
// run(): probe EVERY backend, then start
for (const backend of backends) {
  if (!(await healthFor(backend).catch(() => ({available:false}))).available) {
    useBatchStore.getState().setError(`${label} server isn't reachable …`); return;
  }
}
useBatchStore.getState().startRun();
await runBatchEval(collectionId, targets, tasks, k, maxSteps, globalParams,
                   keepLoaded ? -1 : undefined, runNativeFc);
```

`keepLoaded → keepAlive -1` keeps weights resident; off omits it (backend
default).

### useEvalRun.ts — sequential single-model runner

**Responsibility.** Run every loaded task **sequentially** against one model via
`run_eval_task`, recording each into `evalStore`. Stops on the first IPC error and
surfaces it — never fabricates a score for a task that didn't run. (Simpler path,
used by the legacy single-model surfaces; the batch path is the live one.)

### useRunRecovery.ts — crash recovery

**Responsibility.** On mount, ask the backend `check_unfinished_run`; if a run was
interrupted (and nothing is currently running), surface it for a Resume/Discard
prompt. **Resume** calls `startRun()` then `resume_batch_eval(runId)` — the
backend bulk-paints the already-done Matrix cells then streams the live tail
through the *same* batch events; `await` settles on the final report. **Discard**
drops the recovery log; **Dismiss** keeps it for next launch.

```ts
const resume = useCallback(async () => {
  const runId = pending.run_id; setPending(null);
  useBatchStore.getState().startRun();
  try { await resumeBatchEval(runId); }
  catch (e) { useBatchStore.getState().setError(formatIpcError(e)); }
}, [pending]);
```

---

## `state/` — the four stores

### batchStore.ts — the throttled batch sink

**Responsibility.** Absorbs the high-frequency batch event stream without a
per-event render. **Why:** an agentic model emits hundreds of `agentic-step`
events/sec; naïve `set()` per event would thrash React.

**Shape.** `report` (heavy per-model Matrix, null until `batch-complete`),
`outcomeByKey` (terminal `TaskOutcome` per `cellKey(model,taskId)`), `stepsByKey`
(live `TrajectoryStep[]` per cell), `tasksByModel`, `progress {done,total}`,
`flushes`, `error`.

**How.** Two guards. (1) A **module-level rAF buffer**: events accumulate and
flush at most once per animation frame. (2) An **event gate** (`accepting`): only
true between `startRun()` and `reset()` — late events from an *abandoned* run
(collection/backend switch) are dropped, so the cleared store never re-pollutes
with the wrong collection's data. The gate is decoupled from `running` so a
resume can keep streaming after a partial complete.

```ts
let accepting = false;                 // event gate
ingestStep: (p) => { if (!accepting) return; buffer.push({t:"step",p}); scheduleFlush(); },
complete: (report) => { if (!accepting) return; flushBuffer(); set({report, running:false}); },
reset: () => { accepting = false; buffer = []; if (frame) unschedule(frame); set({...empty(), flushes:0}); },
// applyBatch folds the buffer: progress→outcomeByKey/tasksByModel, step→stepsByKey
```

`cellKey(model,taskId)` is the NUL-joined cache key shared by every reader.

### cliffStore.ts — the survivable probe

**Responsibility.** Runs the context-cliff probe and holds its live series so the
run **survives tab navigation**. Also caches backend-persisted cliff depths per
(collection, model) for the Matrix.

**Shape.** `request` (Matrix pre-fill, consumed by the panel), `points`
(`CliffPoint[]`, live), `running`/`runningModel`, `progress` (per-rung done/total),
`step` (latest fine-grained `CliffStep` — per task generation — drives the live
"rung r/N · position p/3 · task t/M" line + ETA so a slow deep rung never looks
stuck), `startedAt` (ms, for the ETA), and three
collection→model maps: `results` (genuine **collapse depths only**), `probed`
(completed this session, even when no cliff — distinguishes "probed healthy" from
"unprobed"), `brokenBaseline` (failed at the *smallest* context — a tool-call
failure, NOT a context limit).

**How.** A **module-level generation token** (`activeRun`) makes a long sweep
cancellable and re-run-safe; `cliff-progress` events are filtered by both the
token AND the `run_id`, so two runs of the *same* model never bleed. A second
listener on `cliff-step` (same filter) updates `step` per task generation so the
panel's progress bar/ETA advance *within* a rung, not only between rungs. Guardrails:
(1) the probe is **never auto-run** — the user clicks Execute; (2) state is
cleared *before* dispatch so a re-run never appends to a stale series. The awaited
`report` is authoritative — it *replaces* the live series so chart and persisted
status can never disagree.

```ts
unlisten = await listen<CliffProgress>(EVENT_CLIFF_PROGRESS, (ev) => {
  const p = ev.payload;
  if (activeRun !== myRun || p.run_id !== myRun) return;   // token + run_id filter
  set((s) => ({ points: [...s.points,
    { promptTokens: p.point.verified_tokens || null, composite: p.point.composite, trace: p.point.trace }],
    progress: { done: p.done, total: p.total } }));
});
const report = await runContextCliff(model, backend, collectionId, tasks, source, maxTokens, steps, params, myRun);
// stop(): activeRun++ then stop_context_cliff() — actually cancels the backend, not just the UI.
```

`hydrate(collectionId)` reads `get_cliff_results` → restores `results` /
`probed` / `brokenBaseline` so states survive a reload.

### evalRegistryStore.ts — collections & active selection

**Responsibility.** Holds the available datasets (read-only built-in **presets** +
user **custom collections**) and the active `selected` + its `tasks`. The runner
is always handed `tasks`.

**How.** `init` loads `list_builtin_collections` + `list_custom_collections` in
parallel, **publishes the presets to the picker first**, then loads the
`DEFAULT_PRESET = "easy-coding"` tasks — so a single failing default-collection
load can't blank the whole Built-in list (a silent init failure previously left
the page stuck on "Custom JSON" with no collections); the error surfaces in the
panel's error banner instead of being swallowed. NOTE: the registry Zod mirror
(`registry.ts`) must track the backend `EndStateRule` exactly — every bundled v2
scenario serializes `{ require_all: [...] }`, and the spec's v2-only keys
(`world_state`, `must_not_call`, `name_faults`, `generated`) must survive the parse,
since the parsed tasks are handed straight back to `run_batch_eval`. `select`
dispatches on `isPreset` (`get_builtin_collection` vs `load_custom_collection`).
`save`/`remove`
call the registry CRUD then re-list. Presets can't be deleted from disk, so
`hidePreset` just hides them (persisted in `localStorage` under
`qm-eval-hidden-presets`). `startNew()` enters the `NEW_COLLECTION = "__new__"`
sentinel (never sent to the backend). `importFile` wraps `import_custom_collection`.

### evalStore.ts — simple per-task results (legacy single-model)

`tasks`, `results: Record<taskId, EvalRunResult>`, `running`, `currentId`,
`error`. `setResult` merges by `task_id`; `passRate(results)` aggregates. Used by
`useEvalRun`; the live batch path uses `batchStore` instead.

---

## `components/pipeline/` — single-task phase view

`PipelinePanel` is the standalone Config→System Pkg→Stream→Verify stepper over
`trace_toolcall_task` (run live) / `load_toolcall_trace` (replay a cached run
without re-inference). The four phases are dumb presentation components; the
live `TraceDebugger` reuses `ConfigPhase`/`SystemMessagePhase`/`VerifyPhase`.

| File | Phase | Renders |
|---|---|---|
| `ConfigPhase.tsx` | 1 · Input Config | task `prompt` + `JSON.stringify(task.tools)` |
| `SystemMessagePhase.tsx` | 2 · System Pkg | the assembled `system_message` + `user_prompt` |
| `StreamPhase.tsx` | 3 · Stream | the model's **real** `raw_output` (terminal view + caret while running) |
| `VerifyPhase.tsx` | 4 · Verify | pass/fail verdict for the task category |
| `pipelineStyles.ts` | — | shared `panelBox`/`panelLabel`/`codeBlock` styles |

**Phase progression** (`PipelinePanel`):

```tsx
const PHASES = ["Input Config", "System Pkg", "Stream", "Verify"] as const;
// ▶ handleRun → traceToolcallTask(model, backend, task) → setTrace; phase stepper ‹ / ›
{phase === 0 && (task ? <ConfigPhase task={task}/> : …)}
{phase === 2 && (trace || running ? <StreamPhase output={trace?.raw_output ?? ""} running={running}/> : needsTrace)}
{phase === 3 && (trace ? <VerifyPhase verdict={trace.verdict} category={task?.category ?? "single"}/> : needsTrace)}
```

A Scoreboard **handoff** (`focus = {collection, taskId, model}`) jumps to that
cell and shows the *cached* trace without re-running. `execState`
Idle/Running/Cached/Complete; `validation` PASSED/FAILED (via `isPassed`).

---

## `components/scoreboard/` — the comparison surface

### scoreRows.ts — the BatchReport → row transform

**Responsibility.** The single transform from a `BatchReport` to display rows.
**Why it matters:** it encodes the "never fabricate a metric" rule — null sources
render `"—"` (inapplicable, e.g. single-turn has no steps) or `"N/A"` (not
measured, e.g. native FC unsupported), never `0`.

```ts
export function toScoreRows(report, models): ScoreRow[] {
  return report.columns.map((c) => {
    const ag = c.agentic;
    const pass = c.error ? "Error"
      : ag ? `${ag.tasks_passed}/${ag.tasks_total}`   // strict Pass^k
           : fmtPct(c.toolcall?.composite);            // single-turn composite %
    const nat = c.agentic_native_fc;
    const passKNative = c.error ? "Error" : nat ? `${nat.tasks_passed}/${nat.tasks_total}` : "N/A";
    return { model: c.model, label: modelLabel(info ?? {name:c.model}), quant: info?.quantization || "—",
      passK: pass, passKNative,
      avgSteps: ag ? fmtNum(ag.avg_steps) : "—",
      effort:   ag ? fmtTokens(ag.avg_output_tokens_success) : "—",
      schemaResil: ag ? fmtPct(ag.schema_resilience) : "—",
      topError: c.error ? "Error" : ag ? TOP_ERROR_LABEL[ag.top_error] : "—",
      failures: ag?.failures ?? null, composite: fmtPct(c.toolcall?.composite) };
  });
}
```

### PerformanceMatrix.tsx — the cross-model table ("4. LLM Performance Matrix")

**Responsibility.** One row per model with the full metric set, and the **bridge
to the cliff probe**. Reads `batchStore.report` → `toScoreRows`, and the cliff
caches from `cliffStore` (hydrated on mount per `report.collection_id`).

**How.** Per-model badges via `getPassKBadge`/`getSchemaResilBadge`/
`getTopErrorBadge` (green = perfect, amber = partial, red = failure). The **Cliff
Depth** cell is a small state machine, checked in order:

1. `probing…` (this model is the running probe)
2. **`fails from start`** (red) — `brokenBaseline` (checked *before* a depth: a
   broken baseline is persisted as a depth for the readiness gate, but the Matrix
   must show the failure, not dress it as a cliff)
3. **`{n} tok`** — a genuine measured collapse depth (`results[model]`)
4. **`✓ no cliff`** (green) — `probed` healthy across the range
5. **`Run probe ↗`** — unmeasured; `reprobe(model)` sets `cliffStore.setRequest`
   and navigates to the **Audit** tab (never auto-runs — guardrail 1)

`Native FC` column is behind a toggle (`showNative`); N/A is explained (only
Ollama models whose `/api/show` lists the `tools` capability). The `ⓘ` on Top
Error portals the full failure breakdown (Loop Cap / Fake Done / Bad Schema /
Malformed). Clicking a row → `onFocusModel` (scrolls the detail panels up).

### MatrixScoreboard.tsx — the per-task table ("2. The Simulator")

Per the **focused** model: aggregates pass-rate / avg-steps / effort over
`tasks × outcomeByKey`, a live progress bar (`progress.done/total`), and a task
table. Each row's Result badge: `single` → Pass/Fail; `agentic` → all-pass
`Pass`, none `Fail`, **partial → amber `Partial p/total`** ("unreliable, not a
clean pass"). Row click sets `focusedTaskId` → drives `TraceDebugger`. Collapsible.

---

## `components/matrix/` — the standalone matrix surface

`MatrixPanel` owns its own collection picker + multi-select `ModelDropdown`, calls
`run_collection_matrix` + `load_collection_history`, and toggles between
`MatrixGrid` (tasks×models P/T/A badge grid; `onViewTrace` cells) and
`HistoryTimeline` (SVG regression line of composite score over past runs, one line
per model). All pure-presentation given the report.

| File | Role |
|---|---|
| `MatrixPanel.tsx` | Run + view toggle; `evalRegistryStore` + `installedModelsStore`. |
| `MatrixGrid.tsx` | Tasks×models grid; cell = unrun `—` / scored badge (P/T/A/Abs pills) / clickable. |
| `HistoryTimeline.tsx` | SVG composite-over-runs regression chart. |
| `ModelDropdown.tsx` | Multi-select dropdown of matrix columns (Set + onToggle). |

---

## `components/trajectory/` — agentic step replay

### TrajectoryInspector.tsx + TrajectoryStepRow.tsx

**Responsibility.** Render an agentic run as a `Pass^k` header (`passes/total_runs`,
avg-steps, effort, top-error — all "N/A" when the engine reported none) over a
vertical turn timeline. Each `TrajectoryStep` is one turn, colour-coded by
`kind`: tool_call (blue), end_state_reached (green), and the error kinds
(unknown_tool / malformed_json / hallucinated_completion / infinite_loop /
schema_error / tool_error) draw a high-contrast red/amber rail.

```tsx
{steps.map((s, i) => <TrajectoryStepRow key={`${s.run_index}-${s.step_index}-${i}`} step={s} />)}
// row: left rail = KIND_META[step.kind].color; STEP n · label; raw_output <pre>; injection "↳ …"
```

(The live `TraceDebugger` renders an equivalent timeline inline from
`stepsByKey`; `TrajectoryInspector` is the reusable standalone version.)

---

## `components/manager/` — collections & authoring

### EvalManager.tsx — the run + collections control hub (left column)

**Responsibility.** Every run control plus the entry points to authoring/import.
Picks the collection (data-source toggle built-in/custom), the model, `k` and
`maxSteps`, the **native-FC** checkbox, and Run/Stop. Calls **`useBatchRun`**
(run/stop). Buttons: New / Edit (→ `CollectionEditor` via `EvalPage`), Import JSON,
Import CSV (→ `CsvImportModal`), Export. Run is disabled without a model + tasks.
Delete differs: presets are *hidden* (`hidePreset`), customs are *removed*.

### CollectionEditor.tsx — the authoring surface (center, edit mode)

Dual view: `TaskListView` (the list) ↔ `TaskSandboxConfigurator` (edit one task).
Holds a `TaskDraft[]` mirror of the active collection, validates on save via
`validateDrafts` (`evalDraft.ts`), and persists through `evalRegistryStore.save`.
Editing a **preset** forces a name (NameDialog) → saves a new custom copy.
ConfirmDialog guards destructive steps.

### CsvImportModal.tsx — CSV → tasks

**Responsibility.** A live-validated single-turn importer. The shared **Tools box**
supplies tool schemas once; the CSV carries per-case data only
(`id,prompt,expected_tool,expected_args`). Picks a file via the OS picker →
`read_text_capped` (Rust reads + size-caps; the frontend never reads arbitrary
files). Parses live with `csvToCollection` (per-row ✓/✗); import is gated on
`result.tasks && name.trim()` so a partially-broken CSV can never be saved.

### TaskListView / TaskDetailView / TaskSandboxConfigurator / StatsBar / dialogs

| File | One-line |
|---|---|
| `TaskListView.tsx` | Compact task list + toolbar (Add/Save/Run-all); pass/fail badge per row; empty-state. |
| `TaskDetailView.tsx` | Single-task editor: id, category, prompt, tools/expected JSON + error line; StatsBar + verdict checklist. |
| `TaskSandboxConfigurator.tsx` | Edits a full task incl. agentic fields (mocks, end-state, faults, max-recovery); form state only. |
| `StatsBar.tsx` | The 4 tool-call sub-scores (parse / tool / args / abstain rates). |
| `NameDialog.tsx` | Prompt to name a new/forked collection. |
| `ConfirmDialog.tsx` | Generic destructive-action confirm. |
| `KebabMenu.tsx` | `⋯` overflow menu of actions. |

---

## Context-cliff folder

### cliff.ts — verdict classification (pure)

**Responsibility.** Classify a completed probe series into a `CliffVerdict`. The
baseline (rung 0) must clear `CLIFF_BASELINE_PASS = 0.5` before any
"cliff"/"no-cliff" verdict is even considered — a model already failing at the
smallest context has no plateau to fall off.

```ts
export function classifyCliff(points, margin = 0.2): CliffVerdict {
  const base = points[0]?.composite;
  if (base == null) return { kind: "no-baseline" };
  if (base < CLIFF_BASELINE_PASS) return { kind: "broken-baseline", baseline: base };
  for (let i = 1; i < points.length; i++)
    if (points[i].composite != null && base - points[i].composite >= margin)
      return { kind: "cliff", depth: points[i].promptTokens };
  return { kind: "no-cliff" };
}
// cliffPoint() = thin wrapper → the depth, so persisted depth & verdict never disagree.
```

### ContextCliffPanel.tsx — the probe UI (Audit tab)

**Responsibility.** Pick a dataset + model + padding preset, set Max-Tokens and
Test-Steps ladders, run the probe, and graph where accuracy collapses. Owns its
own collection selection (independent of the editor). All probe state lives in
`cliffStore` so it survives navigation.

**How.** Consumes a Matrix pre-fill **reactively** (keyed on
`cliffStore.request`, not on mount — the always-mounted Audit page would miss a
mount-only effect) → sets model override + collection + tokens + steps, then
`consumeRequest()`. Max-Tokens defaults to the model's real context window
(`useVramFit` dims, `/api/show`) and clamps on model switch. The rung table shows
each step's tokens / accuracy / Pass·Failure / **View trace** (expands the system
prompt + per-position model output, "needle at N%"). Read-out maps the verdict to
`≈Nk context tokens` / `broken baseline` / `accuracy maintained up to ≈Nk` /
`Idle`. Execute is greyed without a model + tasks; while running it becomes Stop.

### ContextCliffChart.tsx — accuracy-vs-depth (visx)

SVG line chart (visx `scaleLinear` + `Group`): accuracy% (y) vs prompt-token
depth (x). Only rungs with **both** a measured token depth and an accuracy are
plotted (a rung with no `prompt_eval_count` is dropped, never placed at a
fabricated x). Draws a red dashed **Cliff Threshold** line at `cliffPoint(points)`,
an area fill, per-point dots (red past the cliff), and a hover tooltip
("≈N ctx tokens · X% accuracy · past cliff").

---

## Data-flow walkthroughs

### (a) Tool-call collection across models → matrix → scoreboard

```
EvalManager: pick collection (evalRegistryStore.select → tasks), pick models, set k/maxSteps
  → useBatchRun.run(collectionId, targets, tasks, k, maxSteps, runNativeFc)
       ├ health-probe every backend (fail fast)
       ├ batchStore.startRun()  (gate open, buffer cleared)
       └ runBatchEval(...)  → IPC run_batch_eval
Backend streams: batch-progress (per task done) ─┐
                 agentic-step (per turn) ────────┤→ useBatchRun listeners → Zod-validate
                 batch-complete ({report}) ──────┘   → batchStore.ingest*/complete (rAF-buffered)
MatrixScoreboard: reads outcomeByKey for focusedModel → per-task Pass/Fail/Partial + live progress
PerformanceMatrix: on batch-complete reads report → toScoreRows → one row per model
  → click row → focusModel → TraceDebugger replays that cell (Config→System→Stream→Verify)
```

### (b) Agentic run → trajectory inspector

```
A task with category "agentic" runs the sandbox loop; backend emits agentic-step events
  → batchStore.stepsByKey[cellKey(model,taskId)] accumulates TrajectoryStep[]
Scoreboard row Result = Pass^k (all k pass / partial p/total / fail)
  → click → TraceDebugger (or TrajectoryInspector): Pass^k header + colour-coded turn timeline
    (tool_call · schema_error · hallucinated_completion · infinite_loop · end_state_reached)
```

### (c) Batch crash → recovery dialog → resume

```
App relaunch → EvalPage mounts → useRunRecovery → check_unfinished_run
  → UnfinishedRun {run_id, collection_id, done, total}  → RunRecoveryDialog
Resume → batchStore.startRun() → resume_batch_eval(runId)
  → backend bulk-paints already-done cells, then streams the live tail through the SAME
    batch events (gate stays open across the partial complete) → await → final report
Discard → discard_run(runId) (drops the log) ; Dismiss → keep for next launch
```

### (d) Context-cliff probe → chart

```
PerformanceMatrix "Run probe ↗" → cliffStore.setRequest({model,backend,collectionId,maxTokens,steps})
  → nav to Audit tab → ContextCliffPanel consumes request (pre-fills, never auto-runs)
User clicks Execute → cliffStore.runProbe(...)
  ├ myRun = ++activeRun; clear points; running=true
  ├ listen(cliff-progress): filter by activeRun===myRun && run_id===myRun → append CliffPoint
  └ runContextCliff(...) → backend owns the ladder/padding/verify-and-adjust/persist
On resolve: report.points REPLACE the live series (authoritative)
  → classifyCliff → results[collection][model]=depth | brokenBaseline | probed
  → ContextCliffChart draws accuracy-vs-depth + red Cliff Threshold; hydrate() restores on reload
  → the depth feeds the model's Agent-Readiness verdict (see frontend-inspector-quant-agentreport.md)
```

---

## Support files

| File | Role |
|---|---|
| `verdict.ts` | Pass/fail scoring for tool-call results — `scoreLabel`, `isPassed`, `traceDiag` (failure diagnosis), `verdictToScores`, badge styles. |
| `evalDraft.ts` | `TaskDraft` validation/assembly — `draftFromTask`, `newDraft`, `validateDrafts` (Zod `ToolTaskSchema`/`ExpectedSchema`); shared by the form editor AND CSV import. |
| `csvImport.ts` | RFC-4180 `parseCsv` + `csvToCollection` (strict header/tools/per-row validation → `ToolTask[] | null`); delegates final assembly to `validateDrafts`. |
| `exportBatch.ts` | `batchToCsv` + client-side download (quote-aware `csvCell`). |
| `help.ts` | In-app help copy — `TOOL_HELP`, `METRIC_HELP`, `metricTitle`. |
