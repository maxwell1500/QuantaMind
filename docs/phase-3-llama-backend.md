# Step 3.2 — llama.cpp direct backend

How QuantaMind runs GGUF models without Ollama: a bundled `llama-server`
sidecar, streamed over HTTP, behind the `InferenceBackend` trait. Mirrors the
Ollama path (`inference/ollama/`) so callers stay backend-agnostic.

## Why a sidecar, not FFI

In-process `libllama` bindings would drag a C++/CMake toolchain and per-GPU
build matrix into our crate — against the locked minimal stack (`tech-stack.md`).
`llama-server` is a self-contained HTTP server; we spawn it and stream, exactly
like `ollama serve`. No new Rust dependency, only a bundled binary.

## Backend identity

`BackendKind::LlamaCpp` (serde `"llama_cpp"`) joins `Ollama`. Each model carries
its backend (`InstalledModelInfo.backend`); compare dispatches per row
(`compare_run_row.rs` `match row.backend`).

## Endpoint

Per-backend defaults live in `inference/backend/endpoint.rs`: Ollama
`:11434`, llama-server `:8080`. llama.cpp streams from `POST /completion` with
`{"stream": true}` — newline-delimited JSON (`{"content": "...", "stop": bool}`),
parsed with the existing `inference/http/ndjson.rs::next_line`. Chosen over the
OpenAI-compatible `/v1/...` SSE framing because it reuses our line parser
verbatim. Readiness is probed at `/health`.

## Process lifecycle

- **One server per loaded GGUF.** Started lazily on first use; the model is
  fixed at spawn (`llama-server -m <gguf> --port 8080`), so the request body
  does not carry a model name.
- **Single active model this pass.** Fixed port `8080`. Concurrent servers on
  distinct ports (for parallel multi-model llama.cpp compare) are deferred —
  see `future-considerations.md`.
- **Kill by PID**, tracked in `LlamaServerState` — portable across macOS /
  Windows / Linux (unlike Ollama's macOS-only `pkill -f`).
- Lifecycle is a command-layer concern (`commands/llama/`), never `inference/`
  (which stays Tauri-free per `layering.md`).

## Model discovery

llama-server has no `/api/tags` registry, so models come from disk
(`commands/llama/llama_discover.rs`, pure; `commands/llama/llama_models.rs`,
the thin command). It lives in `commands/` (not `inference/`) because it maps
into `InstalledModelInfo`, a command-layer type `inference/` may not import
(`layering.md`). Two sources:

1. A GGUF models folder (user setting; default under `storage_disk::models_dir`).
2. HF-installed GGUFs — the HF flow now **retains** the downloaded `.gguf` on
   disk (Step 3.2 / B12) instead of deleting it after the Ollama import.

Each `*.gguf` is inspected via `inference/gguf/gguf.rs::inspect_gguf` (family,
parameter size, quantization) and surfaced as an `InstalledModelInfo` tagged
`backend: llama_cpp`. Non-`.gguf` files are skipped.

## Sidecar binary

`tauri.conf.json` `bundle.externalBin` registers `binaries/llama-server`; Tauri
appends the target triple per platform. This pass ships **macOS arm64,
CPU-only** (`llama-server-aarch64-apple-darwin`). Other platforms and GPU
variants are a release follow-up tracked in `cross-platform-builds.md`.

## Out of scope here

- Windows/Linux + GPU sidecar binaries (release follow-up).
- Concurrent llama.cpp servers / parallel multi-model llama compare.
- The `/bench` route migration (Step 3.3) and later Bench surfaces.
