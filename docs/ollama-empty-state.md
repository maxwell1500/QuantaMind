# Ollama not-running empty state

When Ollama is unreachable, the ModelPicker no longer shows a dead-end
error. It renders an actionable empty state that can start Ollama from
inside QuantaMind.

## States (the user-visible state machine)

| State | What the user sees | Triggers |
| --- | --- | --- |
| `idle` | "Ollama is not running" + `[Start Ollama]` (primary) + `Install Ollama` (link). | Default when the picker first sees `ollamaHealthy === false`. |
| `starting` | Spinner + "Starting Ollama…" | The user clicked Start. The button is disabled while busy. |
| `success` | "Ollama started ✓" for ~1s. | Backend returned `already_running` or `started`. After 1s, `ollamaHealthy` flips to true and the picker re-renders into the model dropdown. |
| `error` | Red "Couldn't start Ollama" + verbatim error + `[Retry]`. | Backend returned `start_failed` (port conflict, permissions, ready-timeout) or the IPC itself rejected. |
| `not_installed` | "Ollama is not installed on this machine" + `[Install Ollama]` that opens https://ollama.com/download in the system browser. | Backend returned `not_installed`. |

## Backend (`start_ollama` command)

`backend/src/commands/ollama_start.rs` returns a discriminated union:

```rust
#[serde(tag = "status", rename_all = "snake_case")]
pub enum OllamaStartResult {
    AlreadyRunning,
    Started { pid: u32 },
    NotInstalled { install_url: String },
    StartFailed { error: String },
}
```

Steps:

1. **Fast-path probe.** GET `http://localhost:11434/api/tags` with a 1s
   timeout. 200 → `AlreadyRunning`.
2. **Resolve binary.** `which ollama`, then `/opt/homebrew/bin/ollama`,
   then `/usr/local/bin/ollama`. None found → `NotInstalled`.
3. **Spawn detached.** `ollama serve` with stdin/stdout/stderr piped to
   `/dev/null` so the server outlives QuantaMind.
4. **Poll for readiness.** GET `/api/tags` every 500ms for 10s. Hit →
   `Started { pid }`. Timeout → `StartFailed`.

Process-spawn helpers live in `ollama_runtime.rs` so `ollama_start.rs`
stays under the 100-line cap.

### Idempotency

`OllamaStartState { in_progress: Mutex<bool> }` guards against the user
spamming the Start button: a second concurrent call returns
`AlreadyRunning` immediately and does not spawn a second process.

### Platform support

macOS only this phase. On Windows/Linux, `resolve_ollama()` returns
`None` (forcing the `not_installed` UI) and `spawn_serve()` returns the
"not yet supported on this OS" error if a path is somehow provided.
Tracked for phase 2.

## Frontend

| Concern | File |
| --- | --- |
| IPC wrapper + Zod schema for the discriminated union | `frontend/src/shared/ipc/ollama_start.ts` |
| State machine (`idle → starting → success/error/not_installed`) | `frontend/src/features/workspace/hooks/useStartOllama.ts` |
| Five-state empty-state component | `frontend/src/features/workspace/components/OllamaEmptyState.tsx` |
| Render switch (replaces the old red alert) | `frontend/src/features/workspace/components/ModelPicker.tsx` |

The `success` path waits 1s, then calls
`useWorkspaceStore.setOllamaHealthy(true)` and
`useInstalledModelsStore.refresh()`. The picker re-renders into its
normal dropdown automatically because it already watches
`ollamaHealthy`.

## What's not included this phase

- Auto-start on app launch. The user still clicks Start once if Ollama
  isn't running.
- Quit-time process management. QuantaMind doesn't track or kill the
  Ollama process it spawned; it runs until the user stops it or the
  machine restarts.
- Installing Ollama on the user's behalf. The Install button just opens
  the official download page.
- Windows / Linux auto-start.
