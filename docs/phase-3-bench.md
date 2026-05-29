# Phase 3 — v0.3 "The Bench"

Detailed step breakdown for Phase 3. Phase boundaries live in
`phase-roadmap.md`; the per-step loop is in `workflow.md`.

## Goal

A dedicated **Bench** for comparing models side-by-side on one prompt: per-panel
parameter overrides, output diffing, comparison metrics, saved configurations,
a prompt-template library, and a cloud **baseline reference** (never a primary
inference path — see `product-principles.md`).

The multi-model engine already exists from v0.2 (it was unified into the
Workspace): `inference/compare_runner.rs` (sequential + parallel, per-row
cancellation), the RAM/VRAM verdict (`compare/state/strategy.ts`), per-model
metrics (`compare-done`), and Markdown/JSON export (`buildReport`). Phase 3
re-homes that engine under `/bench` and builds the new surfaces on top of it.

## Steps

| # | Step | Status | Doc |
| --- | --- | --- | --- |
| 3.1 | `InferenceBackend` trait + backend identity (refactor) | done | `architecture.md` |
| 3.2 | llama.cpp direct backend + `ModelInfo.backend` column | done | `phase-3-llama-backend.md` |
| 3.3 | Backend switcher: scope the Workspace to Ollama or llama.cpp | done | `phase-3-llama-backend.md` |
| 3.4 | Sequential vs parallel modes + VRAM gate (surface existing) | done | `compare-feature.md` |
| 3.5 | Output diff highlighting (`diff-match-patch`) | done | `compare-feature.md` |
| 3.6 | Comparison metrics view + bar charts | done | `compare-feature.md` |
| 3.7 | Saved bench configurations (workspace YAML) | done | `compare-feature.md` |
| 3.8 | Export comparison report (+ quantamind.co footer) | done | `compare-feature.md` |
| 3.9 | Prompt templates library (`docs/prompts/`) | done | `compare-feature.md` |
| 3.10 | Cloud baseline comparison (OpenAI/Anthropic/Google/Mistral) | todo | — |

## Architecture decision — Step 3.3 is a backend switcher (revised)

The original 3.3 plan was to move multi-model comparison into a separate
`/bench` route. In practice the first need was simpler: **see and run
llama.cpp**. So 3.3 instead adds a **collapsible left backend panel** (Ollama /
llama.cpp); selecting a backend scopes the Workspace's models and runs to that
server. Compare stays *per backend* (Ollama: 1 = single, 2+ = compare;
llama.cpp: single-model, since `llama-server` runs one model at a time with
manual Start/Stop). The richer comparison-only surfaces (diff, charts, saved
configs, templates, cloud) remain Steps 3.5–3.10. See
`phase-3-llama-backend.md` for the switcher's wiring.

## Re-home (post-3.9): the Workspace runs, "Analysis" analyzes

The 3.4–3.9 Bench tab was reworked: **running moved back into the Workspace** and
the Bench was renamed **Analysis** (read-only). The shipped pieces now live as:

- **3.4** seq/parallel picker + RAM/VRAM verdict — in the Workspace when 2+
  Ollama models are selected (`MultiRun` + `RunStrategyPicker` + `HardwareSummary`).
- **3.5** word-level `DiffView` (diff-match-patch) — Analysis tab.
- **3.6** hand-rolled tok/s + TTFT bar charts (`MetricsChart`) — Analysis tab.
- **3.8** `quantamind.co` footer on Markdown reports + `generated_by` JSON —
  Analysis export. Target export schema (a richer future format) is filed in
  `docs/analysis-schema-v1.md`; the shipped `buildReport` `CompareReport` is the
  simpler v1 to be aligned to `document_type:"bench-report"` later.
- **3.9** bundled `docs/prompts/*.md` templates via `list_prompt_templates`,
  inserted from `PromptTemplatePicker` — now in the Workspace prompt editor.
- The header's single **Start/Stop** next to History (`ServerControl`)
  starts/stops the active backend's *server*; the prompt **Run** is inline in the
  run surface.

**3.7** (saved `*.bench.yaml` configs) UI was removed; its backend commands
(`commands/bench/bench_config.rs`) remain registered but unused. See
`compare-feature.md` + `workspaces.md`. 3.10 (cloud) stays deferred.

## Locked decisions

- **No telemetry.** The "no telemetry / no account / no cloud" promise holds
  (see `product-principles.md` + README). Measure Bench adoption via voluntary
  in-app survey, GitHub discussion polls, and qualitative feedback — never
  silent tracking.
- **Cloud is a reference, not a path.** Scope limits are permanent and live in
  `product-principles.md`.
- **New deps** (require `tech-stack.md` amendment, installed when their step
  lands): `diff-match-patch` (TS, Step 3.5), `keyring` crate (Rust, Step 3.10).

## Never add in Phase 3

- Inspector / deep profiling — Phase 4.
- MLX backend — Phase 5.
- WebGPU — Phase 6.
- AI-agent testing — Someday / Maybe; do not pull forward.
</content>
</invoke>
