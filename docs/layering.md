# Layering

How the backend modules depend on each other, and the two patterns that keep the
domain layer pure and testable. See `architecture.md` for the module list and
`robustness.md` for the failure policy.

## The dependency law

Edges point one way only. A lower layer must never import a higher one.

```
commands/  →  inference/  →  persistence/ , metrics/
   (IPC)        (domain)         (I/O)      (timing)
```

- `commands/` is the only layer that touches Tauri (`AppHandle`, `State`,
  `Emitter`, `#[tauri::command]`).
- **`inference/` must be Tauri-free.** It must not import `crate::commands`, and
  must not name any `tauri::` type. If domain code needs to report progress, it
  takes a **sink** (see below), not an `AppHandle`.
- `persistence/` and `metrics/` are leaves: plain data in, `Result<T, AppError>`
  out, no knowledge of the layers above.

Enforced by a guardrail test (see `robustness.md`): no file under `inference/`
may contain `use crate::commands`.

## Pattern 1 — Sink boundary (invert the dependency)

When the domain must emit progress/results, it defines a **trait** describing the
events in plain domain terms; the IPC layer implements that trait by emitting
Tauri events. The domain depends on its own trait, never on the IPC layer.

```
inference/compare/sink.rs   pub trait CompareSink { fn token(..); fn done(..); … }
commands/compare.rs         impl CompareSink for TauriCompareSink { … app.emit(…) }
```

This is why `commands/` can know about `inference/` types but not the reverse.

## Pattern 2 — Thin command, pure core

A `#[tauri::command]` does three things only: validate input, wire Tauri
plumbing (build the sink/handler, manage `State`), and delegate to a pure
`*_inner` core. The core takes plain data + callbacks and is unit-testable
without a Tauri runtime.

Reference: `commands/prompt.rs` (thin) → `commands/prompt_run.rs::run_prompt_inner`
(pure, integration-tested with mockito). New commands follow this split; logic
that needs a test belongs in the core, not the command.

## Update this doc when

- The set of layers or the allowed edges change.
- A new cross-layer boundary needs a sink/callback contract.
</content>
