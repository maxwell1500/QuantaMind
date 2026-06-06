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

## Global selection: backend, model, params {#global-selection}

The top header carries three app-wide choices, surfaced on every view so it's
always clear what you're running and how:

- **Backend** (`backendStore`) — Ollama / llama.cpp / MLX. The model list is
  filtered to the selected backend; switching backend trims a now-incompatible
  model selection (a model is bound to its backend's weight format).
- **Model** (`selectedModelStore`) — the global selection (an array).
  **Ollama is multi-select** (1 → a single run in the Workspace; 2+ → a
  sequential/parallel compare shown in the Workspace, results on Analysis);
  **llama.cpp/MLX are single-select**. Every page reads this — there is no
  per-page model picker. Analysis is results-only; Eval has its own *target*
  multi-select but it is filtered to the selected backend; the Audit
  Context-Cliff probe runs one global model (a dropdown picks which when 2+
  Ollama models are selected).

The llama.cpp path posts to the native `/completion`; if that route 404s (a build
that lacks it, or another OpenAI-style server answering on the same port — e.g.
`mlx_lm.server`, whose default port is also 8080), it falls back to the
OpenAI-compatible `/v1/chat/completions` so the run still works.
- **Inference params** (`paramsStore`) — temperature, top_p, top_k, max_tokens,
  repeat_penalty, seed. **The single source of truth for every run** — Workspace,
  Analysis compare, Eval batch, and the Context-Cliff probe all read
  `globalParams`. A field left unset is omitted so the backend default applies;
  ranges are validated at the Rust boundary (`commands/prompt/prompt_options.rs`).
  With **2+ Ollama models**, a "use the same parameters for all" toggle switches
  to per-model overrides (`perModelParams`).
- **Keep model loaded** (`paramsStore.keepLoaded`, default off) — off unloads the
  model after each run (Ollama `keep_alive=0`); on keeps it resident
  (`keep_alive=-1`). Ollama-only; llama.cpp/MLX keep their model while the sidecar
  runs.

Prompt files (`*.quantamind.yaml`) no longer store params. An older file that
still carries a `params:` block loads fine (it is ignored and stripped on the
next save). Restoring a run from History puts its params back into the header.
The per-model saved temperature (`model_settings.yaml`) remains a last-resort
fallback, used only when the global temperature is unset.

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

### Backend server down — batch pre-flight {#batch-preflight}

Every backend's server health is polled into the header dots every 5s — Ollama, MLX,
and (new) **llama.cpp** (`check_llama_health`); a dot that was green goes grey within
~5s of the server dying, so the indicator never lies. An Eval **batch run pre-flights
every backend it targets** before starting: if any selected backend's server isn't
reachable it aborts immediately with *"&lt;Backend&gt; server isn't reachable — start it
from the Workspace status bar, then re-run"* — instead of hanging mid-run. Start the
named server from the header, then re-run.

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
  JSON, `schema_unrecovered_calls` = exhausted the recovery budget), and a
  `top_error` headline.
- **Lazy-agent traps (Driver B fault injection).** A task may attach `faults` —
  per-call `TransientError { status_code, clears_after }` or
  `PersistentError { status_code }`, keyed by the same canonical call form as the
  mocks. The sandbox checks a fault **before** advancing the checkpoint (so a
  trapped final call can never be a fake pass) and injects an `HTTP …` error as the
  tool result (a `ToolError` step). A transient clears after `clears_after`
  attempts — a robust agent retries through it to success; a persistent one never
  clears — a robust agent reports the failure (a graceful `Hallucinated` halt)
  rather than looping to the step cap. Attempt counters are **per-run** and
  **per-call**, so multi-tool tasks trap independently and run *k* is never poisoned
  by run *k-1*.
- **Schema resilience (Driver D semantic recovery).** When the task declares tool
  schemas, every parsed call is **semantically validated** (`validate_call`: known
  tool, all `required` params present, primitive types match) — distinct from "did
  it parse" and from "is it the right call". An invalid call injects a precise
  `[Schema error: key \`x\` required]` correction (a `SchemaError` step) and spends
  one of `max_recovery` (default 2) tries; producing a valid call after an error is
  a **recovery**, exhausting the budget ends the run as `MalformedSchema`. The
  report's `schema_resilience` is recovered ÷ runs-that-hit-an-error — **n/a** (UI
  "—") when no run ever hit one, never a fabricated 0. Constrained-decoding paths
  can't emit syntactically-broken calls, so this targets **semantic** faults.
- **Relative effort, not absolute joules.** `avg_output_tokens_success` is the mean
  output-token count (`eval_count`) over the **successful** runs only — **n/a**
  when there are zero successes, never a divide-by-zero. Prompt tokens are
  deliberately never summed (re-sent history would inflate it and ignore KV-cache
  reuse). A Q4 model that wanders 1,500 tokens to a result a Q8 finishes in 300 is
  the signal this exposes — the "faster" quant burning more compute for the same
  outcome.
- **The Matrix columns.** Per model: **Pass^k · Avg Steps · Effort · Schema Resil.
  · Cliff Depth · Top Error**. `Schema Resil.` is the Driver-D metric above;
  `Cliff Depth` is the measured context-cliff depth from the Audit probe (real
  `prompt_eval_count` at the accuracy collapse), read from the backend per
  (collection, model); unmeasured cells show **"Run probe ↗"** which pre-fills the
  Audit probe for that model (see [#context-cliff](#context-cliff)), and a live run
  shows **"probing…"**. `Top Error` shows the dominant failure mode; when a model had
  any agentic failure an **ⓘ** sits next to the badge — hovering it reveals the full
  count of all four modes (Loop Cap · Fake Done · Bad Schema · Malformed), including
  the two the headline badge hides. It's a native tooltip (the Matrix card is
  overflow-clipped, so an absolute popup would be cut off).
  Faults and the recovery budget are authored in the Task & Sandbox Configurator
  (the **Fault Injection** box and **Max Recovery** field); single-turn tasks and
  fault-free agentic tasks omit both and round-trip byte-identical.

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
the sidebar). You can also **Import** an existing `.json` file (read by path, capped
at 1 MiB, validated). CRUD = create / edit / delete (✕ on a custom collection).

**Import CSV (bulk single-turn).** Next to Import .json, **Import CSV** opens a
modal that turns a flat spreadsheet into a custom collection — the on-ramp for
teams who keep test cases in a spreadsheet, not in `ToolTask` JSON. The strict
format is exactly four columns in order: `id,prompt,expected_tool,expected_args`
(one row per task; `expected_args` is a JSON object; an empty `expected_tool`
column means an **abstain** task). Tool schemas are supplied **once** in the modal's
**Tools schema** box and apply to every row, so the CSV stays flat. Scope is
**single-turn only** — `parallel`/`select`/`agentic` don't flatten cleanly and stay
on the JSON/configurator path. The file is read in Rust (`read_text_capped`, same
1 MiB cap; the frontend never reads files); the modal then parses + validates live:
a header in the wrong order is flagged with the exact column, every row gets a
green ✓ or a located red error (bad-JSON args, a tool not in the schema box, a
duplicate id, a missing field), and **Import stays disabled until the whole CSV is
clean** — a partly-broken CSV is never imported. Assembly reuses the same
`validateDrafts` gate as the form editor, and the save re-validates server-side.
(Format reference: Help → "CSV import".)

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

**The probe is part of the pipeline, not a dead-end.** The journey is Eval → Audit → Agent Report.
On the **Performance Matrix**, an unmeasured *Cliff Depth* cell shows **"Run probe ↗"** which
**pre-fills** the probe for that model + the current collection + a context length and switches to the
Audit tab — it **never auto-runs** (a misclick must not lock the GPU on a long sweep); you click
**Execute**. The run lives in a store, so it **survives tab navigation** (a progress bar shows rung
X/N at ~N tokens; **Stop** cancels). On completion the cliff is saved to the backend **per
(collection, model)** — `~/.config/quantamind/cliff/<collection>.json`, written atomically
(temp-file + rename) with the **raw** model name as the key (colons intact). The Matrix then shows the
real **N tok** (read from the backend, not browser storage), and `assess_readiness` feeds each model's
cliff into the verdict: the Agent Report **displays** the Cliff depth, and the context gate **blocks**
(*"reasoning cliff at X < Y needed"*) only when a profile **opts in** via `min_context_tokens` (now
editable in the profile modal). The gate is off by default, so an un-probed model is never silently
failed for context.

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

## Local Agent Readiness {#agent-readiness}

The **Agent Report** tab turns a collection's last batch run into a transparent
per-model verdict answering *"is this local model ready to replace my cloud
agent?"*. It adds no new measurement — it synthesizes the Phase-6 agentic metrics
([Agentic reliability eval](#agentic-eval)) against a **profile** and shows the
exact reasons. Pick a target collection + a profile, click **Run readiness**.

**The verdict.** Each model gets one of three statuses, never a black-box number:

- 🟢 **Ready** — meets every gate in the profile.
- 🟡 **Conditional** — passes the hard gates but trips a *soft target* (e.g. slow,
  or inefficient step count). The reason carries the interpolated math, e.g.
  `slow: 8400ms/step > 5000ms target`.
- 🔴 **NotReady** — trips a *hard gate*. Reasons are explicit, e.g.
  `pass^k 0.40 < 0.80 required`, `loops on some runs`, or `run error: …` for a
  column that failed to produce data.

**Blocking vs conditions.** Hard gates push to `blocking[]` (→ NotReady); soft
targets push to `conditions[]` (→ Conditional). Status = NotReady if any blocking,
else Conditional if any conditions, else Ready.

**Never fabricated.** A metric the engine didn't measure is N/A, never a guessed
pass. If a profile *requires* a metric that wasn't measured (e.g. `require_full_vram`
with no VRAM-fit measurement, or `min_context_tokens` with no cliff probe), that is
**blocking** — ignorance is not a pass; the report tells you to run the missing
diagnostic. The `pass^k` core gate likewise blocks when no agentic run was recorded.
Float comparisons are epsilon-guarded (`1e-6`) so a true `0.80` can't false-block.

**Profiles** are flat JSON files under the OS app-config dir (`readiness/`),
editable by power users and seeded on first run with three built-ins:

| Profile | Min Pass^k | Forbid loops | Forbid fake-done | Full VRAM | Soft targets |
| --- | --- | --- | --- | --- | --- |
| Coding agent | 80% | yes | yes | **yes** | ≤8 steps · ≤5000 ms/step |
| RAG assistant | 70% | yes | yes | no | ≤5 steps · ≤8000 ms/step |
| General agent | 60% | yes | no | no | — |

Built-ins gate on the metrics the engine measures: since Phase 7.4 wired VRAM fit,
**Coding agent** turns `require_full_vram` on (a model that spills past the cap is
NotReady). The `min_context_tokens` and native-FC hard gates stay **off** in
built-ins — those measurements aren't wired yet, and with strict null-gating an
unmeasured requirement would mark every model NotReady for infra reasons. Author a
custom profile to switch any gate on and get exactly that strict behaviour.
Long/nested profile ids are safe: the file is keyed by a 40-char slug plus an
8-hex hash of the full id, so two ids sharing a prefix never collide.

**VRAM fit (Hardware Telemetry).** The Host Hardware Profile panel shows the detected
architecture (Apple unified memory / NVIDIA discrete / CPU) and an allocation-cap
dropdown defaulting to your VRAM (unified RAM on Apple), overridable in-session
(never persisted). For each **Ollama** model the verdict measures the footprint —
exact on-disk weights + the real f16 KV cache (the canonical `vram_math` formula) at
the run's `num_ctx` — against the cap: `fits` when total ≤ cap, a soft **high VRAM
pressure** condition at ≥85% of the cap, **won't fit** otherwise (which, under
`require_full_vram`, blocks). The per-model line reads `VRAM: 6.0 GB (5.0 model +
1.0 cache) < 24 GB cap · fits`. Single-model backends (llama.cpp / MLX) where precise
dims aren't available show **N/A (single-model backend)** — never an approximated fit;
under `require_full_vram` that N/A blocks (ignorance is not a pass). Lower the cap and
a fitting model flips to NotReady deterministically — model the exact hardware you're
buying for.

**Prompt-based vs native path.** Two ways a model can do tool-calling, measured and
labelled **separately** so they're never conflated. The **prompt-based** proxy injects
the tool schemas into the system prompt and parses the text JSON the model emits — the
only cross-backend-fair method. The **native** path (Phase 7.2) runs the *same* agentic
tasks through the model's real `tool_calls` API — the path a production agent actually
uses.

- **Measuring native.** Tick **Measure native tool-calling (Ollama)** on the Eval run.
  For each **Ollama** model that reports the `tools` capability (`/api/show`), QuantaMind
  runs a parallel pass via `/api/chat` with a native `tools` array, parses the real
  `tool_calls`, and shows a **Native FC pass^k** column in the Matrix (behind a toggle).
  Only the call *extraction* differs — the deterministic sandbox, scoring, and failure
  taxonomy are identical, so the two columns are comparable. An empty/abstaining
  `tool_calls` is scored as a correct no-call; parallel `tool_calls` are processed
  one-per-step (the sandbox is sequential). **Ollama-only** today: llama.cpp / MLX show
  **N/A**, never a guessed score — hovering an N/A native cell explains why ("non-Ollama
  backend, or the model has no tools capability"), so following the *enable native* nudge
  never dead-ends at a silent N/A. (The **RUN BATCH** button likewise explains any disabled
  state on hover — "Select at least one model" / "This collection has no tasks".)
- **In the verdict.** When native was measured for a model, the readiness verdict
  **prefers it** — the core Pass^k gate and the loop/hallucination gates use the native
  result, and the row is labelled **(Native FC)**. Models without a native measurement
  fall back to the prompt-based proxy, labelled **(Prompt-Based)**. So a model that passes
  the prompt proxy but fails the native path reads **NotReady** on the path your app
  actually uses — the honest gap, made visible.

**Source of truth.** `run_batch_eval` persists the full report per collection; the
`assess_readiness` command loads it and calls the one pure scoring function
(`readiness::assess`) — the same function a future headless CLI will link, so GUI
and CLI verdicts can never diverge. The frontend stores no verdicts; it renders what
Rust returns. **Export shareable report (.HTML)** emits a self-contained, offline
one-pager (escaped, utf-8) to email a verdict to a CTO.

**The recommendation (the one-line answer).** `assess_readiness` returns the verdicts
**ranked best-first** (`readiness::recommend::rank`, also CLI-shareable) so the page
opens with a leaderboard and a **Recommendation banner**: *"Recommended for {profile}
on your hardware: **{model}** (Ready)."* The ranking key is **tier** (Ready >
Conditional > NotReady), then **effort** (`avg_output_tokens_success`, fewer tokens =
better), then **avg_steps** (fewer = better) — sourced **native-first**, the exact
aggregate the verdict gated on. It is float-safe by construction (`f64::total_cmp`,
unmeasured metrics map to `f64::MAX` and sink — never a `NaN` panic, never floating
above a measured model). When nothing qualifies the banner says **"No model is ready
for {profile} — closest: {model} ({reason})"** — never a fabricated Ready. (Latency,
`ms_per_step`, slots ahead of effort once the per-step timing is wired.)

## Resumable evaluation & VRAM isolation {#resumable-queue}

A multi-model sweep can run for hours; a sleep, an Ollama crash, or a force-quit must
not vaporize it, and two models must never stack in VRAM and OOM-lock the machine.
Phase 7.5 makes a batch **crash-resumable** and inserts a **hardware-enforced VRAM
gate**.

**The job log.** Every run writes an append-only `~/.config/quantamind/jobs/<collection>.jsonl`
— a header line (the full run config: targets, tasks, params) then one line per finished
`(model, task)` unit, appended atomically (`O(1)`, not a read-modify-write). The **native-FC
pass is a first-class citizen** (units tagged `is_native: true`), so an interrupted native
pass resumes too. The order is idempotent — *run → stream → append the outcome line* — so a
crash before the append just re-runs that one unit. A truncated final line (a hard crash
mid-write) is **healed**: the loader discards the unparseable tail rather than panic.

**VRAM isolation (assert-and-fail).** Between models, QuantaMind sends Ollama
`keep_alive: 0` to the previous model and **polls `/api/ps` until its `size_vram` is 0**
before loading the next. If the VRAM doesn't release within 30 s the run **halts** (the job
log stays intact for a later resume) — it never loads onto dirty VRAM, which is the exact
OOM it prevents. (Multi-model batches are Ollama-only; llama.cpp/MLX single-model servers
already reap deterministically via `kill` + `wait`.)

**Recovery.** On the Eval tab, if an interrupted run is found you're prompted to **Resume**
or **Discard**. Resume rebuilds the completed units into **one** partial report that paints
the Matrix instantly (no per-task event flood), then continues the live run, skipping
completed units. On a clean finish the report is **transactionally** persisted — saved,
verified on disk, and only **then** is the job log deleted — so a crash between the two can
never lose the run. At most the one in-flight `(model, task)` re-runs.
