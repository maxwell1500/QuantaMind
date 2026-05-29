# Workspaces

A QuantaMind workspace is a folder on disk holding many prompt files.
You point the app at a folder; the Files panel shows a tree; clicking
a `*.quantamind.yaml` loads it into the workspace.

This replaces v0.1's single-prompt session model. Prompts are now
files you own, version, and share like any other source.

## Model selection drives the mode (v0.3)

Selection is backend-driven, in `compareStore.selectedModels`
(`ModelDropdown.tsx`; `ModelSelectBar.tsx` gates on Ollama health):

- **Ollama** — multi-select. 0 = Run disabled; 1 = single streaming run
  via `run_prompt` (per-prompt params, history, auto-rerun —
  `SingleRun.tsx`); 2+ = one prompt across all, with a RAM-based
  sequential-vs-parallel readout + strategy picker, streaming into
  side-by-side columns (`MultiRun.tsx`). Params don't apply to a multi-run.
- **llama.cpp** — single-select only (one server); single run.

A single **Play/Stop** in the header (next to History) drives whichever
surface is mounted (`runController` + `RunButton`). The **Analysis** tab
holds the tok/s + TTFT charts, the two-model diff, and export — read-only
over the latest run.

## File format: `*.quantamind.yaml`

A human-readable YAML record. Defined in
`backend/src/persistence/prompts/schema.rs`.

```yaml
name: summarize-article
system: You are a precise summarizer.
user: Summarize the article above in 3 bullets.
model: llama3.2:1b
params:
  temperature: 0.5
  top_k: 40
  seed: 42
created_at: 2026-05-27T10:00:00Z
updated_at: 2026-05-27T10:00:00Z
auto_rerun: true
```

Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Display name; renames map to file renames. |
| `system` | string | Optional system prompt; empty when omitted. |
| `user` | string | The user-facing prompt body. |
| `model` | string? | Selected model; absent = inherit picker default. |
| `params` | map | Any subset of inference knobs. Omitted fields = Ollama defaults. |
| `created_at`, `updated_at` | ISO 8601 | Stamped by the backend. |
| `auto_rerun` | bool | Default `false`; omitted when false. |

Unset `params` keys disappear from the YAML so files stay small and
diffs read clean. Missing optional fields load with defaults.

## Workspace shape on disk

```
~/Documents/MyWorkspace/
├── drafts/
│   └── kickoff.quantamind.yaml
├── ideation/
│   └── brainstorm.quantamind.yaml
├── summarize-article.quantamind.yaml
└── .quantamind/             # created lazily; opaque to the user
    ├── history.yaml         # Step 2.3 (LRU 50)
    └── runs/<id>.txt        # Step 2.3 (full output blobs)
```

Subfolders are recursive. Files not ending in `.quantamind.yaml` are
ignored by the tree listing.

## Recents

The N=10 most-recently-opened workspace roots are kept in
`<app_config_dir>/recent_workspaces.yaml`. The header workspace
switcher shows them; clicking re-opens.

## Safety

Every read/write command validates that the target path stays inside
the workspace root before touching disk. `../` traversal is rejected
as `AppError::Validation`. Backed by tests in
`persistence/prompts/io.rs`.

## Commands (IPC surface)

Backend commands (in `commands/workspaces.rs` + `commands/workspace_prompts.rs`):
`open_workspace`, `close_workspace`, `current_workspace`, `list_workspace_tree`,
`recent_workspaces`, `load_prompt`, `save_prompt`, `create_prompt`,
`rename_path`, `delete_path`. Frontend wrappers live in
`shared/ipc/workspaces.ts` and `shared/ipc/prompts.ts`. State is held in
`features/workspaces/state/workspaceStore.ts`; the Files panel and switcher
render it.

## Status

All sub-steps (a–k) complete — see `phase-roadmap.md`. Data round-trip,
tree ordering, rename/delete, and hidden-dir skipping verified by
`backend/tests/workspace_lifecycle.rs`. The live folder-picker flow still
needs a manual check in a running Tauri window.
