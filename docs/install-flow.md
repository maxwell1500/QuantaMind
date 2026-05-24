# Install Flow — HF / Ollama / Local GGUF

Three entry points, one shared invariant: **a successful install must be
observable in the UI before the install hook returns "success"**. The
flow is forensic-hardened against a known Ollama 0.24+ race where
`/api/tags` lags the `/api/create` "success" frame.

## Backend pipeline (HF install)

```
install_hf_gguf
 └─ download_gguf            → emits hf-progress phase=downloading
 └─ install_local_gguf_inner
    ├─ ollama_create         → emits hashing/uploading/creating
    └─ verify_model_registered  ← retries with backoff
 └─ app.emit("models-changed")  (only on success)
```

## verify_model_registered — retry with backoff

`backend/src/commands/verify_install.rs`

Ollama 0.24+ streams `{"status":"success"}` from `/api/create` BEFORE
the model is reflected in `/api/tags`. Observed lag: 50–800 ms. A
one-shot check races and reports a false "silently rolled back" even
though the install succeeded.

The verifier polls `/api/tags` on a backoff ladder (50, 100, 200, 400,
800, 1500 ms) plus a final confirmation read. Only after **all seven
checks miss** does it return the "rolled back" error.

Tests use `verify_with_delays` with a fast `&[1, 1, 1]` ladder against
a `mockito` server. See `verify_install_tests.rs`.

## NDJSON tail-buffer flush

`backend/src/inference/ndjson.rs` (helpers), `consume_create.rs` (create),
`pull.rs` (pull).

The shared NDJSON parser used by both `/api/create` and `/api/pull`
previously required every line — including the terminal `success` —
to be newline-terminated. Ollama 0.24+ has been observed to close
the connection with the final `{"status":"success"}` un-flushed,
causing a successful install to be reported as
"stream ended without success".

Both consumers now flush the un-terminated remainder via
`ndjson::tail(&buf)` after the stream closes and re-run the same
chunk parser. Five integration tests in `consume_create_tests.rs`
cover the with-newline and without-newline success paths plus the
error/no-success cases.

While unwinding `ollama_create.rs` for size, a latent serialization
bug was also fixed: `build_create_body(...)` returns `AppResult<Value>`
but the call site dropped the `?`, so Ollama was receiving
`{"Ok": {"model": ..., ...}}` instead of the unwrapped body. The new
code uses `build_create_body(...)?`.

## Downloads terminal states stay visible

`frontend/src/features/models/components/tabs/DownloadsActive.tsx` +
`DownloadEntryRow.tsx`.

The "In progress" list previously filtered to
`["downloading","installing"]` only, so the entry vanished from the UI
the instant the status flipped to `success` or `error`. Combined with
the `/api/tags` refresh race, the model literally disappeared — present
in no list.

The list now retains `success` and `error` entries with a green
"Installed ✓" or red "Failed" badge plus a Dismiss button. The error
message renders inline. Success entries auto-clear after 5 s; error
entries persist until dismissed so the user has a record of what
broke.

Three test files cover this surface: active rows + cancel flows
(`DownloadsActive.test.tsx`), terminal-state rendering
(`DownloadsActive.terminal.test.tsx`), and timer-based auto-clear
(`DownloadsActive.autoclear.test.tsx`, fake-timer isolated).

## Proactive refresh — installedModelsStore

`frontend/src/features/models/state/installedModelsStore.ts` — single
source of truth for the installed-models list. Holds `list`, `status`,
`error`, `lastRefreshedAt` plus a `refresh()` action that calls
`getInstalledModelsWithStats()` and coalesces concurrent calls.

All three install hooks call `refresh()` themselves on success
(`useHfInstall`, `useLocalImport` immediately; `useModelInstall`
1.5 s later — the Ollama pull task runs spawned-async, so the success
frame from the backend stream is what gates the pull. The delayed
refresh covers any /api/tags lag).

Self-healing: even if Tauri's `models-changed` broadcast is dropped
(listener-registration race, navigation between mounts, etc.), the
hooks themselves force the store to refetch.

Fix 6 will mount a `models-changed` bus that drives the same
`refresh()`, and migrate consumers to subscribe to this store
instead of fetching directly.

## (Fix 5 — Explicit success UI, pending)

## (Fix 6 — Centralized models-changed bus, pending)

## (Fix 7 — useModelInstall nameRef sync, pending)

## (Fix 8 — remove_model emits models-changed, pending)
