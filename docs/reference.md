# Reference

The bench/analysis document contract and the error-state troubleshooting
help (whose anchors back the in-app "Learn more" links). Companion docs:
`architecture.md` and `process.md`.

## Analysis schema

The bench/analysis document contract (v1). `frontend/src/features/compare/format/
schema.ts` exports a populated subset of this shape; keep the two in sync.

### Status

The export (`buildReport.ts`) emits this format as a **populated subset**:
`document_type:"bench-report"`, `schema_version:"1.0.0"`, with
`environment`/`models`/`prompts`/`runs`/`reproducibility` filled from whatever
data we currently have and every other field omitted (the schema keeps them
optional). `findings`/`verdicts` stay empty for app-generated reports. The
remaining gaps (CPU/OS/GPU detail, per-run parameters, `parameter_count`,
`author`/provenance, ULID monotonicity) fill in as the app gains that data.

### What this schema is

One schema covers two artifacts, the report being a special case of the analysis:

- **Bench report** (`document_type: "bench-report"`) — "I ran prompt X against
  models A, B, C on my hardware; here are outputs + metrics." `runs` filled,
  `findings`/`verdicts` empty. This is what the exporter generates.
- **Community analysis** (`document_type: "analysis"`) — a broader investigation:
  many prompts, many models, narrative + opinions. Fills `findings`/`verdicts`.

Same schema so a bench report can be reshared as a building block of a bigger
analysis, and submissions can be aggregated.

### Design principles

- **Versioned from day one** — every document declares `schema_version` (semver,
  e.g. `"1.0.0"`) so future parsers branch cleanly.
- **Hardware + software environment are first-class** — a metric without an
  environment is unfalsifiable. `environment` is required.
- **Outputs denormalized with their prompts** — a fork that edits one prompt
  stays internally consistent.
- **Metrics are nullable** — `null` = "not measured" (distinct from `0`); cloud
  models have no local VRAM, some backends don't expose KV-cache size.
- **Provenance optional in v1** — `author`/signature/submitted-at must not block
  app-generated reports without a signed-in identity.
- **Verdicts/observations separate from raw data** — opinions live in structured
  `findings`/`verdicts`, never mixed into `runs`.
- **Reproducibility included even when imperfect** — recording seed/temperature/
  params makes "I couldn't reproduce" debuggable.
- **IDs are ULIDs** (`document_id`, `run.id`) — time-sortable, unlike UUIDs.
- **Model id convention** `model.{family}_{params}.{quant}`; `source.digest`
  (SHA256) disambiguates same-name/different-weights collisions.
- **Outputs verbatim** — `output.text` is complete, not truncated/normalized.
- **Multi-dimensional 1–5 verdict scores**, not one fake-precise overall number;
  consumers must tolerate unknown score keys (dimensions can grow).

### Field overview

Top-level object (required fields per the JSON Schema marked **R**):

| Field | Shape | Notes |
|---|---|---|
| `schema_version` **R** | string | semver `^\d+\.\d+\.\d+$` |
| `document_id` **R** | string | 26-char ULID |
| `document_type` **R** | enum | `bench-report` \| `analysis` |
| `title` **R** | string | 1–200 chars |
| `summary` | string | |
| `created_at` **R** / `updated_at` | date-time | ISO 8601 |
| `author` | object | `name`, `handle`, `url`, `verified` |
| `license` / `tags` | string / string[] | |
| `environment` **R** | object | `os`, `cpu`, `gpu`, `memory`, `quantamind`, `runtimes[]` |
| `models` **R** | array (≥1) | `id`, `name`, `family`, `parameter_count`, `quantization`, `size_bytes`, `source{type,registry,digest}`, `backend`, `context_length`, `chat_template` |
| `prompts` **R** | array (≥1) | `id`, `name`, `category`, `system_prompt`, `user_prompt`, `expected_behavior`, `evaluation_criteria[]` |
| `runs` **R** | array (≥1) | `id`, `prompt_id`, `model_id`, `started_at`/`completed_at`, `status`, `parameters{}`, `metrics{}`, `output{text,stop_reason,truncated}`, `warnings[]`, `errors[]` |
| `findings` | array | `id`, `type`, `severity`, `related_model_ids[]`, `related_run_ids[]`, `title`, `description`, `evidence` |
| `verdicts` | array | `model_id`, `recommendation`, `reasoning`, `scores{1–5 per dimension}` |
| `reproducibility` | object | `deterministic`, `seed_strategy`, `notes` |
| `links` | object | `blog_post`, `github_discussion`, `raw_outputs_archive` |

`run.metrics`: `ttft_ms`, `tokens_per_second`, `total_tokens_generated`,
`total_prompt_tokens`, `wall_clock_ms`, `prompt_eval_ms`,
`prompt_eval_tokens_per_second`, `vram_allocated_bytes`, `kv_cache_bytes`,
`peak_resident_memory_bytes` — all nullable (`null` = not measured).

> A full populated example document and the complete draft-2020-12 JSON Schema
> skeleton (`$id: https://quantamind.co/schemas/analysis-v1.json`) lived in the
> original `analysis-schema-v1.md`; recover them from git history if you need to
> regenerate the validator.

### Format notes that matter more than the field list

- **ULIDs, not UUIDs** for `document_id`/`run.id` — time-sortable storage.
- **`null` vs `0` in `metrics`** — tooling renders "not available", never "0 MB".
- **`output.text` is verbatim and complete** — no truncation/whitespace
  stripping/unicode normalization. If too large, paginate or compress — never
  lossy-encode the model's speech.
- **`findings`/`verdicts` are optional and separate** — a raw bench report emits
  `runs` only; an analysis fills the rest.
- **`reproducibility` is first-class** — honest info (even "not deterministic,
  here's why") is what makes a submission trustworthy.
- **`verdicts.scores` are 1–5 per dimension**, never one overall number.

### Deliberately left out (add only in a future schema version)

No token-level data / log-probs / embeddings (100× larger). No automatic quality
scoring (BLEU etc.) — quality is human-judged in `verdicts`. No document-level
"winner" — let consumers aggregate `verdicts`. No social metadata
(views/upvotes/comments) — those belong in a community platform's DB.

### Where this lives in the product

- **Export report** — target emitter for `bench-report` (`runs` filled, no
  findings/verdicts). The Markdown export is the human-readable view derived from
  this JSON.
- **QuantaMind reads this format** — display old reports, compare two, import
  shared analyses. Saved bench configurations fit as `bench-report`s.
- **Community platform (far future)** — accepts uploads, validates against the
  JSON Schema, displays/searches by tags/models/hardware. Do not build a
  submission flow until community demand pulls for it.

---

## Troubleshooting

Error states in QuantaMind aim to tell you *what* broke and *what to do next*.
Every run-path error renders an `ErrorCard` (title + helpful body + a primary
action + a "Learn more" link to the relevant section here). Error copy is
classified in `frontend/src/shared/ipc/core/errorInfo.ts`; the card lives in
`frontend/src/shared/ui/ErrorCard.tsx`. The anchors below match the `learnMore`
links the classifier emits (mirrored at `quantamind.co/docs/troubleshooting`).

### Ollama not running {#ollama-not-running}

QuantaMind talks to a local Ollama server at `localhost:11434`. If it isn't
running you'll see "Ollama isn't running".

- Click **Start Ollama** in the model picker's empty state (macOS), or run
  `ollama serve` in a terminal.
- Confirm it's up: `curl http://localhost:11434/api/tags` should return JSON.
- On Windows/Linux, launch the Ollama app/service manually — in-app start is
  macOS-only in this release.

### Model not installed {#model-not-found}

"That model isn't installed" means Ollama doesn't have the model you asked to
run.

- Open the **Models** tab and pull it (Ollama library, HuggingFace, or a local
  GGUF).
- Names are exact, including the tag: `llama3.2:1b`, not `llama3.2`.

### Duplicate models in the picker {#duplicate-models}

If the same model was imported into Ollama under more than one tag (e.g. a local
GGUF added as both `mymodel_q3_k_l:latest` and `mymodel:q3_k_l`), Ollama's
`/api/tags` lists each tag separately. They point to the same blob and share one
`digest`, so the **model picker collapses them to a single entry** (first tag
wins). The **Models → Storage** view still lists every tag so you can delete the
redundant one. Different quantizations (`Q3_K_L` vs `Q2_K`) have different
digests and remain distinct — they are not duplicates.

### Out of memory {#out-of-memory}

"Not enough memory for this model" means it didn't fit in available RAM/VRAM.

- Pick a smaller parameter size (1B/3B instead of 7B/13B) or a more aggressive
  quantization (Q4 instead of Q8) in the Models tab.
- Close other memory-heavy apps.
- In Compare, prefer the sequential strategy so only one model loads at a time.

### Timeouts {#timeouts}

"The request timed out" usually means a large model is still loading its weights
on first use.

- Wait a few seconds and click **Retry** — first load of a multi-GB model can
  take 10–30s.
- If it persists, the model may be too large for this machine; see
  [out of memory](#out-of-memory).

### MLX not detected {#mlx-not-detected}

The **MLX** backend appears in the workspace rail only on Apple Silicon. Install
mlx-lm once (`pip install mlx-lm`). MLX models then work like every other
backend: **download → select → Start → run/eval/quant.**

**Download:** in **Models → HuggingFace**, flip the **GGUF / MLX** toggle to MLX
and search (GGUF, the default, is unfiltered; MLX is narrowed to `mlx`-tagged
repos, mostly `mlx-community`). Open a repo and click **Download for MLX** — the
full snapshot (config + safetensors + tokenizer) lands in `~/.quantamind/mlx/`
(override with `QUANTAMIND_MLX_DIR`). The **detail view follows the repo's tags,
not the toggle**, so an `mlx`-tagged repo opens the MLX download even when found
under GGUF search.

**Select + run:** the downloaded model appears in the Workspace dropdown
(labelled by its HF repo) as soon as it's downloaded — no running server needed.
Pick it, press **Start MLX** (the header launches `mlx_lm.server --model <local
dir>`; "Starting…" while it loads), and once green run prompts / eval / quant
like any backend. One model loads at a time; pick another and Start to switch.

**Guardrail — text-generation only.** `mlx_lm.server` serves text-generation
LLMs; a text-to-speech / embedding / vision repo would download gigabytes and
then never answer a chat request. So **Download for MLX** checks the repo's task
and, if it isn't `text-generation`, shows a blocking dialog ("This model won't
run on MLX") with a *Pick another* / *Download anyway* choice.

- **"mlx_lm.server not found"** — QuantaMind searches `PATH` and common venvs
  (`~/mlx-env/bin`, `~/.venv/bin`, Homebrew, conda). If yours is elsewhere, set
  `QUANTAMIND_MLX_SERVER` to its full path and restart.
- **"Port 8082 in use" / "no free port"** — it auto-picks a free port in
  8082–8092; only if all are taken does it fail. Free one and retry.
- **It exited** — the error shows the server's stderr tail (e.g. a missing
  Python dep). Fix it in your venv and Start again.
- **Model not in the dropdown?** The picker lists what's been downloaded into
  the MLX folder; download it from the HuggingFace tab first. (A model loaded by
  a manually-run `mlx_lm.server` won't appear — discovery is disk-based now.)
- **Reproducibility note:** mlx_lm.server has no seed parameter, so MLX runs are
  not seed-reproducible the way Ollama and llama.cpp runs are — a fixed seed in
  the params is ignored for MLX.

### Reporting something else

Use the in-app **Feedback** button (bottom-right). Tick "Include diagnostic info"
so we get your app version, OS, and current model.

## Tool-calling eval {#toolcall-eval}

The **Eval** tab's tool-calling test measures whether a model can reliably drive
an agent — entirely offline and deterministic. Read the scores with these caveats:

- **Prompt-based, not native function-calling.** The tool schemas are injected
  into the system prompt and the JSON call is parsed from the completion text.
  This is backend-agnostic (identical on Ollama / llama.cpp / MLX) and mirrors
  how many local-agent builders work — but the numbers are **not comparable to
  BFCL / native-FC leaderboards** (which use a `tools` field + native
  `tool_calls`). Treat them as a within-app, like-for-like comparison.
- **Structural scoring, not execution.** A call is judged by matching the tool
  **name + arguments structurally** (BFCL's validated proxy), never by running
  the function. So scores reflect *format + selection correctness*, not runtime
  success. Extraction is lenient about wrappers (a bare object, a JSON array, or
  bare `{..}\n{..}` sequences all parse) and **collapses identical (name+args)
  calls**, so a chatty model that prints its call inline *and* echoes it in a
  trailing ```` ```json ```` block isn't wrongly failed by the cardinality guard;
  genuinely distinct parallel calls are kept.
- **Single-turn, greedy (temp 0), ~13-task fixture.** No multi-turn / agent
  loops; greedy decoding makes scores reproducible and comparable across quants
  (and sidesteps MLX's missing seed). The fixture is small and curated —
  **indicative, not leaderboard-grade.**
- **The four metrics are independent.** `parse_rate` (did it emit a parseable
  call when one was needed) is separate from tool/args accuracy, so "100% tool ·
  100% args but 50% parse" reads correctly as *"reasoning is fine, formatting is
  brittle"* — the #1 local-agent failure. A metric shows **n/a** (not 0) when no
  task exercises it. An unreachable backend → **"Not available"**, never a score.
- **Custom tasks** — author your own collections in the **Eval** tab (see the
  contract below). The runner treats built-in and custom tasks identically.

## Agentic reliability eval {#agentic-eval}

Where the tool-calling eval is single-turn, the **agentic** engine runs a model
through a stateful, multi-step loop inside a deterministic sandbox — measuring
not just whether the model claims success, but whether it *did the work*, and how
much compute it burned getting there. Agentic tasks live **alongside** single-turn
tasks in the same collection (an agentic `ToolTask` carries an optional `agentic`
spec); the **Eval** workspace runs a mixed collection across several models in one
streaming batch and renders a per-model Matrix (Pass^k · Avg Steps · Effort · Top
Error), with a click-through Trace Debugger. See [the workspace](#eval-runner).

- **Prompt-based sandbox, same as the tool-call eval.** The `DeterministicSandbox`
  holds the initial prompt, the tool schemas (injected into the system prompt via
  the shared `build_system_for`), the mock tool results, and an `EndStateRule`.
  No native function-calling — identical across Ollama / llama.cpp / MLX.
- **The loop.** Each turn: render the running transcript → model emits a JSON tool
  call (parsed with the same lenient `extract_calls`) → the sandbox returns the
  mocked result, injected back as a `"Tool result: …"` text message. A call the
  sandbox doesn't recognize gets an error injection and the loop continues. Mock
  lookup is on a **canonical key** (tool name + recursively key-sorted args), so a
  model that reorders its arg keys still hits the right mock.
- **The anti-cheat (`EndStateRule`).** Two variants. `RequireSequence` is an
  ordered checklist of `(tool, args)` checkpoints — the run succeeds **only** after
  the model calls each in order (same structural arg-equality the tool-call scorer
  uses). A model that yields with `{"status":"task_complete"}` without finishing the
  sequence is logged as a **hallucinated completion**, never a pass — it can't be
  gamed by claiming done. `ExpectAbstainingText` is the inverse: success is a correct
  plain-text refusal with **no** tool call (so a robust planner that declines an
  unsafe/unnecessary action isn't mis-scored as lazy); acting anyway fails.
- **Pass^k consistency.** The loop runs `k` times (default 5) with absolute
  isolation between runs. The `AgenticReport` carries `passes/total_runs`, a
  `FailureTracker` with **distinct** tallies (`infinite_loop_hits` = hit the step
  cap, `hallucinated_completions` = fake done, `malformed_json_calls` = broken
  JSON), and a `top_error` headline.
- **Relative effort, not absolute joules.** `avg_output_tokens_success` is the mean
  output-token count (`eval_count`) over the **successful** runs only — **n/a**
  when there are zero successes, never a divide-by-zero. Prompt tokens are
  deliberately never summed (re-sent history would inflate it and ignore KV-cache
  reuse). A Q4 model that wanders 1,500 tokens to a result a Q8 finishes in 300 is
  the signal this exposes — the "faster" quant burning more compute for the same
  outcome.

## Custom-eval collections {#custom-evals}

Run the curated built-in suite or your own task collections. Each collection is a
JSON **array of `ToolTask`** objects, saved as one `.json` file under
`app_config_dir/evals/` (portable — commit or send the file to share).

**Authoring (master-detail).** In the **Eval** tab, **+ New Collection** opens a
small name dialog, then an empty task list. **+ Add Task** opens a task in its
**detail** editor (id, prompt, tools JSON, expected JSON); **← Back** returns to
the list. Click any task row to reopen its detail. Validation is friendly and
inline — an empty prompt or id shows "Prompt: required" / "Task ID: required",
never a raw error. **Save** persists the collection (it then appears, selected, in
the sidebar). You can also **Import** an existing file (read by path, capped at
1 MiB, validated). CRUD = create / edit / delete (✕ on a custom collection).

Any selection is editable — including a built-in preset; editing a preset and
saving writes a new custom copy (the bundled preset is read-only and stays a seed).

**Running.** Pick a model, then: **▶ Run this task** in a task's detail runs that
one task live (your current, even unsaved, edit) and shows its verdict checklist +
the four sub-scores; **▶ Run all** on the list runs the whole **saved** collection
(Save first — it's disabled while there are unsaved edits) and tags each row
pass/fail plus the aggregate Parse / Tool / Arg / Abstain bar.

A `ToolTask`:

```json
{
  "id": "weather-paris",
  "category": "single | parallel | select | abstain",
  "prompt": "What's the weather in Paris?",
  "tools": [
    {
      "name": "get_weather",
      "description": "Get the current weather for a city",
      "parameters": {
        "type": "object",
        "properties": { "city": { "type": "string", "description": "City name" } },
        "required": ["city"]
      }
    }
  ],
  "expected": { "type": "call", "name": "get_weather", "args": { "city": "Paris" } }
}
```

`tools[].parameters` is a **JSON-Schema object** — the shape you already paste
from real tool definitions. `expected` has three shapes (internally tagged):

- **`{ "type": "call", "name": …, "args": {…} }`** — exactly one tool call.
- **`{ "type": "parallel", "calls": [ {…}, … ] }`** — several at once (scored as
  an order-independent set).
- **`{ "type": "no_call" }`** — abstention: the model should *not* call a tool
  (e.g. a general-knowledge question with only an unrelated tool offered).

Every collection is validated **server-side** regardless of source — a
hand-edited or imported file with an unknown category, a malformed `parameters`
block, a category that disagrees with `expected`, or a call to a tool the task
doesn't offer is rejected as `invalid_task_schema`, naming the offending field.
The in-app "Check JSON" button mirrors this for fast feedback but is not the
trust boundary.

## Model inspector & template guard {#model-inspector}

The **Eval** tab inspects the selected installed model via Ollama's `/api/show`:

- **Chat template** — the model's Go chat template, shown verbatim as inert text
  (never executed/injected). Use it to debug *why* prompts misbehave: a template
  with no system/assistant roles can't honour a system prompt.
- **Capabilities** — the features Ollama reports (`completion`, `tools`, `insert`,
  `vision`, …). `tools` is the strongest "instruct/agent-ready" signal.
- **Base-model advisory** — a soft flag (with its reasoning) when the metadata
  looks like a base/text-completion model: no chat-role markers in the template
  **and** no `tools` capability. It's a heuristic, not a verdict — the panel says
  *why* ("no 'tools' capability; no chat-role markers"), so you can judge. A base
  model will ignore system prompts and tool-call unreliably.

**Ollama-only.** The template/capabilities come from `/api/show`; on llama.cpp /
MLX the panel shows "Not available — Ollama only" rather than guessing.

## VRAM & context fit {#vram-fit}

The Quant tab predicts whether a model **plus its context window** fits in memory — the failure
that silently OOMs or spills to CPU. Pick a context length (4K/8K/32K/128K, capped at the model's
max) and each quant's fit becomes:

```
required = base_weights + KV_cache
KV_cache = 2 (K+V) × layers × kv_heads × head_dim × 2 (f16 bytes) × context_length
```

(`head_dim = embedding_length / head_count`.) The KV cache grows **linearly with context** and is
independent of the weight quantization — so a model that fits at 4K can OOM at 128K. When `required`
exceeds available memory the quant shows an **"OOM Risk"** badge and can't be run at that context;
the recommendation honours the same gate.

- **Dims come from Ollama `/api/show`.** On llama.cpp / MLX the predictor falls back to a
  file-size × 1.3 heuristic, **flagged approximate** (`~`).
- **Speed is memory-bandwidth-bound, not FLOPS-bound.** Token throughput tracks GB/s, so the tab
  shows the chip's nominal bandwidth (curated table) or "Not available" — never a guessed number.

## Silent CPU fallback {#cpu-fallback}

When a model doesn't fully fit the accelerator, Ollama quietly offloads layers to system RAM and
keeps running — far slower, and it silently ruins any speed/eval timing. The Eval tab flags this for
the selected model from `/api/ps` (`size_vram` vs `size`): "⚠ ~X% of this model is on CPU". Shown
only when an accelerator is present and weights are actually spilled — **Ollama-only**, nothing
fabricated on other backends or when the model isn't loaded.

## Context budget {#context-budget}

The Inspector shows how much of the context window a run consumed — the exact server-reported
`prompt_eval_count` over the model's `context_length` — turning red at ≥95% (past which earlier
tokens are silently dropped). Exact counts only; "Not available" when either number is missing.

## Built-in presets & the finance set {#builtin-presets}

The tool-call eval ships built-in presets — **Curated Suite** and **Finance (preset)** — selectable
alongside your own collections. The bundled files are read-only, but selecting a preset loads its
tasks into the editor, so you can tweak them and Save an editable copy under your own name. The
finance set exercises balance / sum /
transaction-search tools (+ abstention). It measures **structural tool-call reliability** (does the
model emit the right call?), **not** data/PDF parsing — the "expected" is the *command*, never the
underlying data.

## Collection matrix & regression history {#matrix}

The **LLM Performance Matrix** (in the Eval tab) batch-runs a whole collection across several
installed models at once and tracks how scores move over time. Pick an **Active Collection**, choose
models from the **Models** dropdown, and press ▶ Run. Models run **sequentially** (local backends dislike
concurrent load); one model's backend being down is captured as that **column's error** and never
aborts the rest of the batch.

- **Matrix view** — rows = tasks, columns = models. Each cell shows **P T A** (parse / tool-match /
  arg-match, green pass / red fail) or **Abs ✓/✗** for abstention tasks, so failure patterns jump out.
  The footer shows **Avg. Score** (mean composite across the models that ran).
- **Timeline view** — a composite-score trend line per model across consecutive runs, so an engine
  update or prompt change that regresses tool-calling shows as a visible drop. The axes are labelled
  (**y** = composite score %, **x** = run order, oldest → newest); hover a point for its exact value.
  **Runs** = recorded history entries for the collection.

Each successful model run is appended to an append-only JSON log at
`app_config_dir/history/<collection>.json`, **capped at 100 entries** (oldest dropped). Like
collections, these are plain, human-readable files — no database.

## Tool-call pipeline visualizer {#pipeline}

The **LLM Tool-Calling Evaluator** makes a single task's run transparent — no black box. Pick a
collection + task + model and press ▶; step through four phases with the ◀ ▶ stepper:

1. **Input Config** — the user prompt + the tool definitions (JSON schema) the task carries.
2. **System Pkg** — the **Constructed System Message** *actually sent* to the model (tools injected).
3. **Stream** — the **real** `> INFERENCE STREAM`: the model's actual raw completion (not a mock built
   from the expected answer).
4. **Verify** — the Evaluation Engine Report mapping the structural verdict to named checks
   (**JSON Regex Extraction** = parsed, **Tool Name Key Match** = tool match, **Parameter Type
   Validation** = args match; abstain tasks show **Correct Abstention**) with an *N% SUCCESS* badge.

The **Execution State** and **Validation** (Pending / PASSED / FAILED) rows track the run. This is
powered by a dedicated `trace_toolcall_task` command that runs one task and returns the exact system
message, raw output, and verdict — the same single-task path `run_eval` uses, so the trace matches a
real run. A stopped backend surfaces as a clear error rather than a hang.

**Cached traces (no re-run).** Running the Simulator or the Matrix saves each task's full trace to
`app_config_dir/traces/<collection>.json`. Clicking a Simulator row's **View Trace** or a **Matrix
cell** opens the Debugger on the saved data instantly — **Execution State: Cached**, no inference —
so you can inspect what the model received and returned without re-running. Press ▶ to re-run live.
The cache is best-effort: if it's missing (e.g. an older run) or a write failed, the Debugger falls
back to a live trace.

## Eval Runner: Scoreboard ↔ Debugger {#eval-runner}

The Simulator and the Pipeline visualizer are paired under an **Eval Runner** toggle in the Eval tab:

- **Batch Scoreboard** — the *Tool-Calling Evaluation Simulator*. It has its own **Active Collection**
  picker, so it batch-runs **any** collection — your own custom collections as well as the built-in
  presets — against one model, showing the per-task pass/fail table, the category bar chart, and the
  aggregate sub-scores + composite.
- **Trace Debugger** — the single-task Pipeline visualizer above.

Each Scoreboard row has a **View Trace** button: clicking it flips the toggle to the Debugger and loads
that exact collection + task + model, ready to ▶ — connecting the macro "which tasks failed?" view to
the micro "why did this one fail?" trace.

## Context-cliff probe {#context-cliff}

Runs a dataset at increasing prompt lengths and graphs where tool-call accuracy collapses
— the "context cliff" many local models hit well before their advertised window. The x-axis is the
model's **real measured prompt-token depth** (`prompt_eval_count` reported by the backend, averaged
over the rung's tasks) — **not** a chars/4 estimate. The padding amount is a knob (benign filler
sized in chars); the plotted depth is always measured. A rung the backend reports no token count for
shows **"Not available"** and is dropped from the chart rather than placed at a made-up x.

The probe owns its own **Active Collection** picker (independent of the EvalManager editor), so it
always has a real dataset to run. The **Max Tokens** control sets the padding target (how much filler
to add) and is capped at the model's reported **context window** when known (Ollama `/api/show` dims),
falling back to a fixed ceiling otherwise.
A run that errors surfaces a **"Not available — …"** banner rather than a silent blank chart. The
cliff is the first rung whose composite drops **≥ 20pp** below the unpadded baseline, reported at that
rung's measured token depth; if it never collapses the read-out shows **"Accuracy maintained up to
≈N tokens"**. ↺ clears the results. Single-turn, greedy — a failed rung is a gap, never a fabricated score.

## Comparing across models/quants needs Ollama {#multi-model-ollama-only}

Anything that runs *several models* in one go — the **Quant** tab's quality and
tool-call comparison columns, and "Compare speed in Bench" — only works on
**Ollama**. Ollama serves any installed model by name, so QuantaMind can switch
between quants on a single running server.

`llama.cpp` (`llama-server`) and **MLX** (`mlx_lm.server`) are **single-model
servers**: each loads one model at launch and serves whatever it has loaded,
ignoring the requested name. So on those backends:

- The Quant comparison buttons are **disabled** with a note — size/fit and the
  recommendation still work (they're computed from the file, not the server).
- The Eval / tool-call panels show a note: the run targets **whichever model the
  server has loaded**, so load the exact model you mean to test (or use Ollama to
  compare across models).

This is a property of those servers, not a QuantaMind limitation; auto-restarting
a single-model server per model is a deferred future option.
