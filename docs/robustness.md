# Robustness — no silent failures, no leaky data

Every failure is either handled or surfaced. The user (or a test, or a log) must
be able to tell that something went wrong. Fabricating a plausible-looking result
is worse than an error, because it hides.

## No silent failures

- **No `let _ =` on a fallible call** (a `Result`, a `JoinHandle`) unless it is a
  documented best-effort cleanup — and even then route it through a helper that
  logs the failure. For Tauri event emission use the `log_emit` helper, never a
  bare `let _ = app.emit(...)`: a dropped event silently freezes the UI.
- **Don't swallow serialization errors.** `serde_json::to_value(...)` and friends
  must log (or propagate) on failure, not vanish in an `if let Ok(_)`.
- **Observe spawned tasks.** Don't `let _ = join_all(handles)`; inspect each
  result and surface a panic/error as an event, not nothing.
- **Frontend: validation failures surface to state.** When a zod `safeParse`
  fails on an IPC payload, set an error state on the affected row/download (and
  log) — never `console.error` then `return`, which leaves the UI frozen. Promise
  rejections get a real handler, not a bare `.catch(() => {})`.

## No leaky data

- **Never fabricate data on error.** No zero-on-poison: a `token_count: 0` after a
  panic is indistinguishable from a real empty run. Emit a distinct
  degraded/error signal instead, so the UI can show "incomplete," not "done."
- **Don't blank error context.** `resp.text().await.unwrap_or_default()` turns an
  HTTP error body into "" — keep it (or annotate the read failure) so diagnostics
  survive.
- **Validate at every boundary.** zod on inbound IPC payloads (TS), `validator` +
  serde on inbound commands (Rust). Untrusted data never reaches domain logic
  unchecked.

## Errors are typed

Rust returns `Result<T, AppError>`; TS returns discriminated unions over IPC, not
thrown errors. **No `unwrap()`/`expect()`/`.parent().unwrap()` outside tests** —
prove the invariant or return a typed error.

> Known limitation / future option: `AppError` variants are stringly-typed
> (`Inference(String)`), so io errno / HTTP status is flattened to a message.
> Enriching them is high-ripple and deferred; the discriminated-union-over-IPC
> shape is acceptable for now.

## Guardrail

A backend test enforces the layering invariant (no `use crate::commands` under
`inference/`) and flags any folder with >10 files (see `folder-taxonomy.md`).

## Update this doc when

- A new class of failure or boundary appears.
- The error model changes (e.g. structured `AppError`).
</content>
