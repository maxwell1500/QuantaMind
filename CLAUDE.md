# CLAUDE.md — QM-Dev (QuantaMind)

Project guide for Claude Code sessions. Read this top-to-bottom before any work.

## Non-negotiable rules

1. **One step at a time.** Do not start the next step until the current one is
   (a) implemented, (b) its test case passes, AND (c) output verified for data
   quality. See `docs/workflow.md`.
2. **Test pass ≠ data quality pass.** A green test only proves the code ran the
   path you told it to. You must also inspect the *output* and confirm it
   matches the expected shape/values. See `docs/data-quality.md`.
3. **Every file < 100 lines.** Hard limit. Split modules before they grow.
   Includes source, tests, configs, docs. Headers/blank lines count.
4. **Separation of concerns + single-module architecture.** Each file does
   exactly one thing. Each module owns one responsibility. No "utils.ts"
   junk drawers. See `docs/architecture.md`.
5. **Documentation is part of the change.** When you change behavior, update
   the doc in the same commit. If no doc exists, create one in `docs/`.
6. **Locked tech stack.** Do not substitute libraries. See `docs/tech-stack.md`.
   Alternatives go to `docs/future-considerations.md`, never into code.

## Workflow per step (mandatory loop)

```
1. Read the step spec (from docs/phase-roadmap.md or user request)
2. Write the minimum code to satisfy it
3. Write the test for the expected behavior
4. Run the test — must pass
5. Inspect actual output vs expected output — must match in shape AND value
6. Update the relevant doc(s) in docs/
7. Commit (Conventional Commits)
8. Only now: move to the next step
```

If step 5 fails, do not "fix" by loosening the assertion. Fix the code.

## Quick reference

- **Stack:** Tauri 2.x + Rust + React 18 + TS 5 + Vite + Tailwind + Zustand.
  Full table in `docs/tech-stack.md`.
- **Layout:** `frontend/src/` (React features) + `frontend/` configs,
  `backend/src/` (Rust commands + inference) + `backend/tauri.conf.json`,
  plus `docs/`. Full tree in `docs/folder-structure.md`.
- **Naming:** Rust `snake_case`, TS `camelCase`, components `PascalCase`,
  branches `phase-N/feature-name`. Full list in `docs/conventions.md`.
- **Setup:** Day-zero install + verification steps in `docs/setup.md`.
- **Phases:** Current roadmap and phase boundaries in
  `docs/phase-roadmap.md`.

## What NOT to do

- Do not add a logging library, state-machine library, UI kit, form library,
  or extra Tauri plugins until the phase that requires them.
- Do not create `utils/`, `helpers/`, `common/`, or `misc/` directories.
- Do not write multi-paragraph comments. Code is self-documenting; docs live
  in `docs/`.
- Do not skip a test because "it's obvious." Obvious code still fails.
- Do not refactor opportunistically during a feature commit. Refactor in a
  separate commit with its own tests.
- Do not exceed 100 lines per file. If you're at 95, split now.

## When in doubt

- File too long → split by concern, not by line count.
- Test passing but output looks wrong → trust the output, fix the test or
  the code.
- Doc out of date → update the doc before the next commit.
- Architectural question → propose in chat, do not invent silently.

## Index of docs

- `docs/architecture.md` — module boundaries + IPC diagram
- `docs/tech-stack.md` — locked dependency decisions
- `docs/folder-structure.md` — full tree + rationale
- `docs/setup.md` — day-zero install/verify
- `docs/conventions.md` — naming, commits, branches
- `docs/workflow.md` — the step-by-step loop
- `docs/data-quality.md` — how to verify output
- `docs/phase-roadmap.md` — phases 1–5 outline
- `docs/future-considerations.md` — parking lot for "better" ideas

Keep this file under 100 lines. If it grows, move detail into `docs/`.
