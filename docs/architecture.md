# Architecture

QuantaMind is a Tauri desktop app: React/TS frontend, Rust backend, JSON IPC,
HTTP to a local Ollama server.

## Mental model

```
┌─────────────────────────────────────────────────────────────┐
│                  QuantaMind Desktop App                     │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │            React + TypeScript Frontend             │    │
│  │  features/  ←  shared/ipc/  ←  Tauri invoke()      │    │
│  └──────────────────────────┬─────────────────────────┘    │
│                             │                              │
│                    IPC boundary (JSON)                     │
│                             │                              │
│  ┌──────────────────────────▼─────────────────────────┐    │
│  │               Rust Backend (backend/)              │    │
│  │  commands/  →  inference/  →  metrics/             │    │
│  │       ↓                                            │    │
│  │  persistence/                                      │    │
│  └──────────────────────────┬─────────────────────────┘    │
└─────────────────────────────┼──────────────────────────────┘
                              │ HTTP
                              ▼
                ┌─────────────────────────────┐
                │   Ollama (localhost:11434)  │
                └─────────────────────────────┘
```

## Module boundaries

### Frontend (`frontend/src/`)

- `app/` — application shell, routing, providers. No feature logic.
- `features/<name>/` — self-contained vertical slice. Owns its components,
  hooks, state, types, schemas, and tests. Deletable in one rm -rf.
- `shared/ipc/` — only place that calls Tauri `invoke`. Typed wrappers.
- `shared/components/` — primitives reused by 2+ features. If only one
  feature uses it, it lives in that feature.

### Backend (`backend/src/`)

- `commands/` — IPC entry points. Thin. Validate input, call domain, return.
- `inference/` — backend adapters behind `InferenceBackend` trait.
- `metrics/` — measurements: TTFT, tokens/sec, VRAM.
- `persistence/` — YAML/JSON read+write of prompts and history.
- `validation/` — schemas. Shared by commands and persistence.
- `errors.rs` — single `AppError` enum. No `unwrap()` outside tests.

## Rules

1. **One file = one concern.** If you need "and" to describe what a file
   does, split it.
2. **No cross-feature imports.** Features talk to each other only via
   `shared/` or via the backend.
3. **IPC is the only Rust/TS bridge.** No code-gen, no shared types file —
   keep contracts explicit in `shared/ipc/types.ts` and mirror in Rust.
4. **Validation at boundaries.** Zod on the TS side, `validator` + serde on
   the Rust side. Never trust IPC payloads.
5. **Errors are typed.** Rust returns `Result<T, AppError>`. TS returns
   discriminated unions, not thrown errors across IPC.
6. **Hooks for ephemeral, store for shared.** Per-action state that lives
   only as long as the action (mid-run output, install progress, ongoing
   fetch) belongs in a hook's local `useState`. Cross-component state
   read by parts of the UI that don't drive the action (current model,
   list of installed models, last run's final metrics) belongs in the
   Zustand store. Hooks may write to the store at completion (the result
   of an action), but components must not read both the hook's local
   state and the store for the same piece of data — pick one source per
   piece of data.

## Update this doc when

- A new top-level module is added.
- A boundary rule changes.
- The IPC contract gains a new category of message.
