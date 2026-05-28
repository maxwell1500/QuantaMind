# Folder taxonomy

One concern per file (see `conventions.md`); and **no folder holds more than 10
files**. When a folder reaches the limit, split it into sub-folders grouped by
concern — never a `misc/`/`utils/` catch-all. Finding a file should be a matter
of guessing the right concern folder.

Enforced by a guardrail test on each side (`backend/tests/layering_guard.rs`,
`frontend/src/__tests__/folderTaxonomy.test.ts`). `__tests__` dirs are exempt —
they mirror their source one-to-one, so their size is already bounded.

## Target sub-folder layout

These four folders currently exceed the limit and are split as follows (the
reorg lands one folder per commit, behavior unchanged).

### backend `commands/` (was 36 files)

`prompt/` · `compare/` · `models/` · `hf/` · `gguf/` · `ollama/` · `workspace/` ·
`storage/` · `settings/` · `system/` (health, feasibility, hardware, onboarding)

### backend `inference/` (was 33 files)

`ollama/` · `gguf/` · `hf/` · `pull/` · `create/` · `compare/` · `http/`
(http + ndjson) · `backend/` (trait + kind) · `generate/` (spec + options) ·
`chat/` (templates)

### frontend `features/workspace/components/` (was 17 files)

`model-select/` · `prompt/` (editor + params) · `run/` (single/multi + controls +
output) · `status/` (status bar, ollama control, errors)

### frontend `shared/ipc/` (was 26 files)

Grouped by domain (a single `commands/` would itself exceed 10): `core/`
(client, error, errorInfo, timeout, types) · `events/` (event names + payload zod
schemas) · `compare/` · `models/` · `workspace/` · `settings/` · `system/`

## Rules for a split

- Move files only; do not change behavior in a reorg commit.
- Update the module's `mod.rs` (Rust) / import paths (TS); run the full suite
  green before committing.
- Keep tests beside their code through the move.

## Update this doc when

- A folder crosses 10 files and needs a new sub-grouping.
- A sub-folder's concern boundary changes.
</content>
