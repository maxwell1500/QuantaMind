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
| 3.3 | Bench view layout; migrate multi-model out of Workspace | todo | — |
| 3.4 | Sequential vs parallel modes + VRAM gate (surface existing) | todo | `compare-feature.md` |
| 3.5 | Output diff highlighting (`diff-match-patch`) | todo | — |
| 3.6 | Comparison metrics view + bar charts | todo | — |
| 3.7 | Saved bench configurations (workspace YAML) | todo | — |
| 3.8 | Export comparison report (+ quantamind.co footer) | todo | — |
| 3.9 | Prompt templates library (`docs/prompts/`) | todo | — |
| 3.10 | Cloud baseline comparison (OpenAI/Anthropic/Google/Mistral) | todo | — |

## Architecture decision — Bench owns comparison

v0.2 unified multi-model comparison *into* the Workspace. Phase 3 reverses that:
**Step 3.3 moves the multi-model path out of the Workspace into a new `/bench`
route**, and the Workspace returns to lean single-model. Bench grows
comparison-only UI (per-panel params, diff, charts, saved configs, templates,
cloud) that would otherwise bloat the Workspace.

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
