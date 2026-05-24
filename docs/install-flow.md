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

## (Fix 2 — NDJSON tail flush, pending)

## (Fix 3 — Downloads terminal states, pending)

## (Fix 4 — Proactive refresh in install hooks, pending)

## (Fix 5 — Explicit success UI, pending)

## (Fix 6 — Centralized models-changed bus, pending)

## (Fix 7 — useModelInstall nameRef sync, pending)

## (Fix 8 — remove_model emits models-changed, pending)
