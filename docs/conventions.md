# Conventions

## Naming

| Domain | Style | Example |
|---|---|---|
| Rust functions / vars | `snake_case` | `run_prompt` |
| Rust types | `PascalCase` | `InferenceBackend` |
| Rust constants | `SCREAMING_SNAKE` | `DEFAULT_TIMEOUT_MS` |
| TS functions / vars | `camelCase` | `runPrompt` |
| TS components / types | `PascalCase` | `PromptEditor` |
| TS constants | `SCREAMING_SNAKE` | `DEFAULT_TIMEOUT_MS` |
| React component file | `PascalCase.tsx` | `PromptEditor.tsx` |
| TS non-component file | `kebab-case.ts` | `use-streaming-run.ts` |
| Rust file | `snake_case.rs` | `ollama.rs` |
| Branch | `phase-N/feature-name` | `phase-1/streaming-output` |

## Commits — Conventional Commits

- `feat:` — new user-visible behavior
- `fix:` — bug fix
- `chore:` — tooling, deps, config
- `docs:` — documentation only
- `test:` — adding or fixing tests
- `refactor:` — no behavior change

One step = one commit (or a tight related series). PR title matches the
commit convention. PR body references "closes #N" when applicable.

## File size

- **Hard limit: 100 lines** including blank lines and headers.
- At 95 lines, split now. Do not wait.
- Splits are by concern, not by arbitrary halving.

## Comments

- Default: write none. Naming + structure carry the meaning.
- Write a one-line comment only when the *why* is non-obvious (a workaround,
  a subtle invariant, a constraint that is not visible in the code).
- Never reference tickets, callers, or "I added this for…" — those belong
  in the PR description and rot fast.

## Errors

- Rust: `Result<T, AppError>` only. No `unwrap()` outside tests.
- TS: discriminated unions returned across IPC. No thrown errors over the
  IPC boundary.

## Tests

- Live next to code: `__tests__/` in TS, inline `#[cfg(test)]` in Rust,
  integration in `src-tauri/tests/`.
- Name tests after the behavior, not the function:
  `streams_tokens_in_order` not `test_run_prompt`.
- One behavior per test.

## Colors

- All colors flow through the theme tokens in `frontend/src/styles/
  tokens.css`. Use Tailwind palette classes (token-backed) or the
  `surface`/`ink` semantic colors.
- No hardcoded hex outside `tokens.css`. See `docs/theming.md`.

## Imports

- Absolute imports for cross-feature in TS (`@/shared/...`).
- Relative imports within a feature.
- Rust: prefer `use crate::module::...` over deeply nested relative paths.
