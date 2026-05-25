# Live model browsing

How QuantaMind surfaces the Hugging Face and Ollama Library tabs in the Add
Model modal. Replaces the bundled-catalog approach used in Phase M
through M.5.39.



## Why live

The previous bundled JSON catalogs (`huggingface-catalog.json`,
`ollama-catalog.json`) shipped with the binary and went stale fast.
The list a user saw could disagree with what was actually pullable —
the "mismatch" problem this doc exists to prevent.

## Hugging Face — live JSON API

### Search
- Frontend: debounced text input (300ms) in `HuggingFaceTab.tsx`.
- IPC: `hf_search(query, limit?)` in `shared/ipc/hf_browse.ts`.
- Backend command: `commands/hf_browse.rs::hf_search` →
  `inference/hf_browse.rs::search_models`.
- HTTP: `GET https://huggingface.co/api/models?search=<q>&library=gguf&sort=downloads&direction=-1&limit=<n>`.
- Result shape: `[{id, downloads, likes, tags, last_modified}]`. UI shows
  the repo id, formatted download/like counts, and the first four tags
  per card.

### Variants (per repo)
- Frontend: `HuggingFaceRepoDetail.tsx` + `hooks/useHfRepoVariants.ts`.
- IPC: `hf_repo_files(repo)` returning `[{path, size_bytes}]`.
- Backend: `commands/hf_browse.rs::hf_repo_files` →
  `inference/hf_browse.rs::repo_gguf_files`.
- HTTP: `GET /api/models/{repo}/tree/main?recursive=true`. Backend
  filters to `type:"file"` + `.gguf` suffix.
- Quantization label parsed client-side by `features/models/parse_quant.ts`
  from the filename (`Q4_K_M`, `IQ4_XS`, `BF16`, …). Filenames with no
  recognised quant render as `quantization:"unknown"`; the install name
  then falls back to the lowercase basename with no `:tag`.

### Install dispatch
- Unchanged from M.5.33 (`install_hf_gguf(repo, filename, name)`), with
  `name = hfVariantModelName(filename, quantization)` → `<base>:<quant>`
  to satisfy Ollama 0.24's name validator.

### User-Agent
- All backend HTTP clients (`probe_client`, `streaming_client`) set
  `User-Agent: quantamind/<CARGO_PKG_VERSION>`. HF behind Cloudflare can 400
  on empty UA; this prevents that class of failure.

## Ollama Library — free-text install

Ollama has no public JSON search API; the only "browse" surface is
`ollama.com/library` (HTML). Rather than scrape, the Ollama tab is a
single name input + Install button (`OllamaLibraryTab.tsx`). The user
types any Ollama model name (`mistral:7b`, `qwen2.5:14b`, etc.) and the
existing `pull_model` command runs. A live `list_models` subscription
marks the typed name "Installed ✓" when it matches.

## Offline / error UX

No fallback to a bundled list. If the HF API is unreachable:
- Search renders an inline error with a Retry button.
- Repo detail renders the same shape (loading → error → Retry).
- Ollama install surfaces Ollama's own error (e.g. 404 → "not found"),
  no preflight check.

## Out of scope (for now)

- HF auth tokens for gated repos. Returns `AppError::AuthRequired`
  surfaced as friendly text; user can't supply a token in-app yet.
- Pagination beyond the first 30 results.
- Ollama Library scraping or third-party index mirrors.
- Caching last successful search to disk (would land with Phase 2's
  `plugin-store`).

## Files
- Backend: `commands/hf_browse.rs`, `inference/hf_browse.rs`,
  `inference/http.rs` (UA + clients).
- Frontend: `shared/ipc/hf_browse.ts`,
  `features/models/parse_quant.ts`,
  `features/models/hooks/useHfRepoVariants.ts`,
  `features/models/components/HuggingFaceRepoDetail.tsx`,
  `features/models/components/tabs/HuggingFaceTab.tsx`,
  `features/models/components/tabs/OllamaLibraryTab.tsx`.
- Tests: `backend/tests/hf_browse.rs`, `backend/tests/hf_repo_files.rs`,
  `frontend/src/features/models/__tests__/parse_quant.test.ts` and the
  rewritten component tests.
