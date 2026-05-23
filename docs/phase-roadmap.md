# Phase Roadmap

High-level phases. Each phase has its own implementation file
(`02_phase1_implementation.md`, etc.) added when the phase begins.

Each step inside a phase follows `workflow.md` strictly: implement → test
passes → output verified → docs updated → commit → next step.

## Phase 1 — Workspace MVP — shipped v0.1 (2026-05-21)

Goal: edit a prompt, run it against Ollama, stream the output, save/load
the prompt as YAML.

Modules touched:
- `src/features/workspace/`
- `src-tauri/src/commands/{prompt,models,workspace}.rs`
- `src-tauri/src/inference/ollama.rs`
- `src-tauri/src/persistence/prompts.rs`

Exit criteria:
- Run prompt → tokens stream into the UI.
- Cancel mid-stream works cleanly.
- Save / load prompt round-trips byte-identical YAML.
- TTFT + tokens/sec displayed correctly.

## Phase 1.5 — Remediation

P0 + critical P1 fixes from the Phase 1 forensic audit (2026-05-21).
3–4 evenings. See `02b_phase1.5_remediation.md`. Must complete
before M.1.

## Phase M — Model Management

Goal: install, remove, and inspect Ollama models from inside the app.
Three install sources (Ollama library, Hugging Face GGUF, local file).
Inserts between Phase 1 and Phase 2; may run parallel to Phase 2.

Modules touched:
- `src/features/models/`
- `src-tauri/src/commands/models.rs`
- `src-tauri/src/inference/{huggingface,gguf,modelfile,chat_templates}.rs`

Exit criteria: all three install sources work end-to-end; storage view
accurate ±5%; disk pre-checks refuse <2GB-free installs; no orphaned
partial files or temp Modelfiles after success/cancel paths.

Step ledger lives in `03_phaseM_implementation.md`.

## Phase M.5 — Live browsing (in progress)

Drops the Phase M bundled catalogs in favour of live data — HF tab
calls `huggingface.co/api`, Ollama tab becomes free-text install (no
public search API to scrape). Full design + file list in
`live-browsing.md`. Exit: catalog JSONs removed; offline renders error
+ Retry, never a stale list.

## Phase 2 — Settings + Persistence

Goal: persistent user settings, model defaults, history of recent runs.

Modules touched:
- `src/features/settings/`
- `src-tauri/src/commands/settings.rs`
- `src-tauri/src/persistence/history.rs`
- Introduces Tauri `plugin-store` and `plugin-fs`.

Exit criteria: settings persist across restarts; history is browsable
and replayable.

## Phase 3 — Bench (multi-model comparison)

Goal: run the same prompt across N models, side-by-side comparison.

Modules touched:
- `src/features/bench/`
- `src-tauri/src/inference/llama_cpp.rs`

Exit criteria: ≥2 backends usable; outputs aligned in the UI; per-model
metrics correct.

## Phase 4 — Inspector

Goal: VRAM, latency breakdown, token-by-token timing.

Modules touched:
- `src/features/inspector/`
- `src-tauri/src/metrics/vram.rs`

Exit criteria: live metrics during a run; export to CSV.

## Phase 5 — MLX backend

Goal: native Apple-Silicon inference path.

Modules touched:
- `src-tauri/src/inference/mlx.rs`

Exit criteria: Same prompt produces equivalent output on Ollama and MLX
backends; user can pick the backend per run.

## Updating this doc

- When a phase begins, add its implementation file under the same prefix
  (`02_phase1_implementation.md`, `03_phase2_implementation.md`, …).
- When a phase ships, mark it "shipped — vX.Y" and freeze its section.
- Do not change a shipped phase's exit criteria retroactively.
