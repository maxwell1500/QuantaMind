# Phase roadmap

Where each phase begins and ends. Per-step status lives here; per-step
docs live next to each as they ship. Workflow per step is in
`workflow.md` (implement → test → verify output → docs → commit).

## Phase 1 — v0.1.0 (shipped)

Day-zero usable single-prompt workspace. See `features-v0.1.0.md` for
the full feature breakdown. Tests: 67 backend + 336 frontend passing.

## Phase 2 — v0.2 Daily-driver polish (in progress)

Turns v0.1 into a daily driver: prompts on disk, every inference knob
exposed, auto-rerun on save, error states tell you what to do, ships
on Windows + Linux, keyboard-first coverage.

Steps execute in the reordered sequence below (locked by plan).
Workspaces ship first so params, history, and auto-rerun all attach
to a real "current prompt file" from day one.

| # | Step | Status | Doc |
| --- | --- | --- | --- |
| 2.4 | Workspaces & files | done (pending live GUI check) | `workspaces.md` |
| 2.1 | Parameter controls | done (pending live GUI check) | `inference-params.md` |
| 2.2 | Auto-rerun on save | done (pending live GUI check) | `auto-rerun.md` |
| 2.3 | Prompt history | done (pending live GUI check) | `history.md` |
| 2.5 | Better error states | done (pending live GUI check) | `troubleshooting.md` |
| 2.7 | Light theme + system theme | done (dark values need visual tuning) | `theming.md` |
| 2.6 | Onboarding | done (pending live GUI check) | `onboarding.md` |
| 2.10 | Keyboard shortcuts | done (pending live GUI check) | `keyboard-shortcuts.md` |
| 2.8 | Windows + Linux builds | done (CI authored; needs a tag run to verify) | `cross-platform-builds.md` |
| 2.9 | Auto-update polish | done (pending live GUI check) | `auto-update.md` |

Locked decisions:
- Storage: workspaces are folders of `*.quantamind.yaml` files; no
  tauri-plugin-sql.
- Hotkeys: hand-rolled `useHotkey`, no new dep.
- Windows: ship unsigned in 2.8; cert deferred to
  `future-considerations.md`.

Never add in Phase 2: multi-model comparison (in v0.1), browser-based
inference, team features, cloud sync.

Step-level acceptance gate (each step "done" only when all true):
- Code merged behind `phase-2/<step>` PR
- Tests green; full Vitest + cargo suites pass
- Output verified per `data-quality.md`
- Relevant docs updated in the same commit
- No file >100 lines
- Locked stack honored; new deps require `tech-stack.md` amendment

## Phase 2.4 sub-progress

| # | Sub-step | Status |
| --- | --- | --- |
| 2.4.a | Backend `persistence/prompts/schema` (PromptFile + InferenceParams) | done |
| 2.4.b | Backend `persistence/prompts/io` (read/write/delete/rename + traversal guard) | done |
| 2.4.c | Backend workspace tree listing (recursive, sorted, hidden-dir aware) | done |
| 2.4.d | Backend `persistence/workspaces` (recents, LRU 10) | done |
| 2.4.e | Tauri commands wiring (10 commands: open/close/current/tree/recents + load/save/create/rename/delete) | done |
| 2.4.f | Frontend `useWorkspacesStore` + IPC wrappers (`prompts.ts`, `workspaces.ts`) | done |
| 2.4.g | `FilesPanel` + `FilesTree` + `FileRow` sidebar | done |
| 2.4.h | `WorkspaceSwitcher` (recents dropdown + open) | done |
| 2.4.i | `useAutoSave` (500ms debounce) + `useOpenWorkspace` | done |
| 2.4.j | Refactor `Workspace.tsx` to read from store (editors gated on open prompt) | done |
| 2.4.k | `App.tsx` layout shift (FilesPanel beside Workspace) | done |

2.4 complete. Tests: backend 95 lib + 2 lifecycle integration; frontend 361
(11 new for workspaces). Verified via `workspace_lifecycle.rs` (round-trip,
tree order, rename/delete, hidden-dir skip, human-readable YAML). Not yet
exercised in a live Tauri window (folder picker needs a GUI + display).

## Phase 3 — v0.3 "The Bench" (in progress)

A dedicated model-comparison Bench: per-panel params, output diff, metrics,
saved configs, prompt templates, and a cloud baseline reference. Full step
breakdown in `phase-3-bench.md`; scope limits in `product-principles.md`.

Steps 3.1–3.3 done: the `InferenceBackend` trait, the llama.cpp `llama-server`
sidecar backend, and a left **backend switcher** that scopes the Workspace to
Ollama or llama.cpp (3.3 was revised from a `/bench` route to the switcher —
see `phase-3-bench.md`). Steps 3.4–3.10 (richer comparison surfaces) remain.

## Phase 4+

Phases 4–5 are sketched in the v0.1 planning notes (Inspector / deep profiling,
MLX backend, etc.) but not yet broken into steps. Owners flesh out the next
phase's section here when the current phase lands.
