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
mlx-lm once (`pip install mlx-lm`), then use the header **Start MLX** control:
type an MLX repo (e.g. `mlx-community/Llama-3.2-3B-Instruct-4bit`) and Start —
QuantaMind launches `mlx_lm.server` for you (it downloads the repo on first run,
so "Downloading weights…" can last a few minutes), and the model appears in the
dropdown once it's up.

- **"mlx_lm.server not found"** — QuantaMind searches `PATH` and common venvs
  (`~/mlx-env/bin`, `~/.venv/bin`, Homebrew, conda). If yours is elsewhere, set
  `QUANTAMIND_MLX_SERVER` to its full path and restart.
- **"Port 8082 in use" / "no free port"** — it auto-picks a free port in
  8082–8092; only if all are taken does it fail. Free one and retry.
- **It exited** — the error shows the server's stderr tail (e.g. a missing
  Python dep). Fix it in your venv and Start again.
- **Manual fallback:** you can still run `mlx_lm.server --model … --port 8082`
  yourself; QuantaMind discovers a manually-run server on the default `:8082`.
- **Reproducibility note:** mlx_lm.server has no seed parameter, so MLX runs are
  not seed-reproducible the way Ollama and llama.cpp runs are — a fixed seed in
  the params is ignored for MLX.

### Reporting something else

Use the in-app **Feedback** button (bottom-right). Tick "Include diagnostic info"
so we get your app version, OS, and current model.
