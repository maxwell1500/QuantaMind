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

The header's single **Start/Stop** next to History (`ServerControl`) starts/stops
the active backend's *server*, not the prompt; the prompt **Run/Cancel** (Compare
for 2+) stays inline. The read-only **Analysis** tab has charts, diff, and export.

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

Unset `params` keys disappear from the YAML so files stay small; missing optional fields load with defaults.

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

Backend (`commands/workspaces.rs` + `workspace_prompts.rs`): `open_workspace`,
`close_workspace`, `current_workspace`, `list_workspace_tree`, `recent_workspaces`,
`load_prompt`, `save_prompt`, `create_prompt`, `rename_path`, `delete_path`. Frontend
wrappers in `shared/ipc/{workspaces,prompts}.ts`; state in `workspaceStore.ts`.

## Status

All sub-steps (a–k) complete — see `phase-roadmap.md`. Round-trip, tree order,
rename/delete, and hidden-dir skipping are verified by `backend/tests/workspace_lifecycle.rs`.
