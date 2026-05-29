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

## Shared weights folder

One **canonical GGUF folder** is the source of truth for both engines, resolved
by `storage_disk::gguf_dir_resolved`: user setting (`UserSettings.models_folder`,
set from the Storage page) → `QUANTAMIND_GGUF_DIR` env → `~/.quantamind/gguf`.
Commands resolve it via `UserSettingsState::weights_dir(app)`;
`resolve_models_folder` exposes the path to the UI.

- **HF downloads** and **local-file installs** are saved/copied here (llama.cpp
  loads them directly) **and** imported into Ollama when reachable (Ollama keeps
  its own internal copy).
- **Ollama pulls stay Ollama-only** — not exported into the folder, so they
  aren't available to llama.cpp.

## Model discovery

llama-server has no `/api/tags` registry, so models come from disk
(`commands/llama/llama_discover.rs`, pure; `commands/llama/llama_models.rs`, the
thin command — resolves the folder via `weights_dir`). It lives in `commands/`
(not `inference/`) because it maps into `InstalledModelInfo` (`layering.md`).
Each `*.gguf` is inspected via `inference/gguf/gguf.rs::inspect_gguf` (family,
params, quant) → `InstalledModelInfo` tagged `backend: llama_cpp`; others skipped.

## Sidecar binary

`llama-server` needs its sibling `libllama`/`libggml` dylibs colocated
(`@rpath`/`@loader_path`), so the **whole `binaries/` dir** ships via
`tauri.conf.json` `bundle.resources` (not `externalBin`, which copies only the
lone binary and dies with a `dyld` error). `llama_dir()` resolves the dir at
runtime: `QUANTAMIND_LLAMA_DIR` env → `resource_dir()/binaries` (prod) →
source-tree `backend/binaries` (dev); `spawn_server` runs the binary there with
`current_dir` + `DYLD_FALLBACK_LIBRARY_PATH` set. `scripts/fetch-llama-server.sh`
populates it (macOS arm64, CPU-only this pass). Other platforms/GPU variants are
a release follow-up — `cross-platform-builds.md`.

## Ollama-down handling

When Ollama is unreachable the import is skipped (the GGUF is already in the
shared folder for llama.cpp). Only the **Ollama** backend treats that as an
error (`ollama_import_required`) — a llama.cpp download still succeeds with
Ollama off (no `/api/blobs/...` failure). The HF frontend passes
`workspaceStore.activeBackend`.

## UI — backend switcher (Step 3.3)

A collapsible left **BackendPanel** lists Ollama and llama.cpp; selecting one
sets `workspaceStore.activeBackend`. The Workspace then scopes to it: the model
picker filters by `m.backend`, and `run_prompt` carries the chosen `backend`
(backend-aware single run). llama.cpp is single-select with **manual**
Start/Stop in the panel — Start launches `start_llama_server(model.path)` on the
selected GGUF; Run is gated on `llamaHealthy`. Discovered llama.cpp GGUFs are
merged into the installed-models list (`installedModelsStore`).

## Out of scope here

- Windows/Linux + GPU sidecar binaries (release follow-up).
- Concurrent llama.cpp servers / parallel multi-model llama compare.
- Richer comparison-only Bench surfaces (Steps 3.5–3.10).
