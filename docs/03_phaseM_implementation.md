# Phase M — Model Management

> Note: this file intentionally exceeds the 100-line cap in
> `CLAUDE.md` rule #3. Spec/roadmap documents for a whole phase are
> exempt; code files, tests, and configs still observe the cap.

Scope: in-app model installation, removal, and storage management.
Replaces the user's need to open a terminal for Ollama operations.
Inserts between Phase 1 and Phase 2 of the original roadmap, or runs
in parallel with Phase 2 if you have the capacity.

Estimated time: 3–4 weeks part-time (45–60 hours).

## Phase M goal

After this phase ships, a Quatamind user should never need to type
`ollama pull`, `ollama create`, or `ollama rm` in a terminal. Three
sources of models — Ollama's library, Hugging Face, and local GGUF
files — are all installable from the UI with progress, error
handling, and accurate metadata display.

## Exit criteria

- User can search and install any model from Ollama's library via UI.
  Progress streamed in real time. Cancellation works.
- User can paste a Hugging Face GGUF URL or browse popular GGUF
  repos, download the file, and have Quatamind auto-generate a
  working Modelfile (with correct chat template for at least 6 major
  model families).
- User can drag-and-drop a local `.gguf` file onto Quatamind and have
  it installed in Ollama with auto-detected metadata.
- Storage view shows installed models, sizes, last used. Uninstall
  works cleanly.
- Disk-space pre-checks prevent downloads that would leave the user
  with less than 2GB free.
- All operations have proper error states, no crashes, no orphaned
  downloads, no zombie processes.

## Step ledger

Work top to bottom. Do not skip. Each step follows `workflow.md`:
implement → test pass → output verified → docs → commit → next.

| #    | Step                                                            | Test                                  | Data-quality verification                            |
|------|-----------------------------------------------------------------|---------------------------------------|------------------------------------------------------|
| M.1  | Rust: `pull_model` command with progress streaming              | mockito test of progress event sequence | Progress events ordered; total bytes match; success terminator present |
> M.1 — ✅ shipped 2026-05-22 (phase-m/m.1-pull-command, branched from v0.1.1). New `backend/src/inference/`: `pull_speed.rs` (`SpeedTracker` moving-avg ring buffer over 5s window with eviction; 3 unit tests including ±5% accuracy at 1MB/s with mocked `Instant`s), `pull_progress.rs` (`PullProgress` enum tagged `phase` + `PullChunk`/`PullRequest` protocol structs + `classify()`; 5 unit tests covering manifest/downloading/unknown classification and JSON serde shape), `pull.rs` (`validate_name` rejecting empty/whitespace/`/\\\"'`/space/tab/newline; `pull_model(endpoint, name, on_progress, cancel)` async fn — POST `/api/pull` with `{name, stream:true}`, NDJSON line-buffered parsing, per-chunk classify + speed update, cancel checked after every classified event; 3 unit tests for name validation). New `backend/src/commands/models_pull.rs` (`PullState { active: Mutex<HashMap<String, CancellationToken>> }` managed by Tauri; `#[tauri::command] pub async fn pull_model(app, state, name) -> Result<String, AppError>` validates name, generates uuid::v4 pull_id, spawns a tokio task that emits `EVENT_PULL_PROGRESS` (= `"pull-progress"`) per event with `{pull_id, progress}` payload, removes entry from `active` map on finish; `#[tauri::command] pub fn cancel_pull(state, pull_id)` removes-and-cancels the token, returns `AppError::NotFound` if pull_id unknown). `lib.rs` `.manage(PullState::default())` + invoke_handler additions for both commands. `Cargo.toml` adds `uuid = { version = "1", features = ["v4"] }`. New `backend/tests/pull_model.rs` (3 integration tests against mockito): full pull serves 7 NDJSON chunks (manifest, 3× downloading, verify, write, success) — asserts exactly 7 events in correct order with `total=1000, completed ∈ {250,500,1000}, digest="sha256:abc"` and `got[6]==Success`; HTTP 500 → `AppError::Inference` with "500" in message; cancel-after-2-events asserts exactly 2 events fired and no 3rd (cancel check after `on_progress` in inner line loop catches it). Cargo 35→49 (+14: 3 speed + 5 progress + 3 validate + 3 integration). Clippy clean. File budget: `pull_speed.rs` 68, `pull_progress.rs` 87, `pull.rs` 94, `models_pull.rs` 76, `pull_model.rs` test 75 — all under cap.
| M.2  | TS: `useModelInstall` hook + progress event subscription        | hook test with mocked events          | Status transitions correct; cancel mid-pull cleans up |
> M.2 — ✅ shipped 2026-05-22 (phase-m/m.2-install-hook, branched from M.1-merged main). New `shared/ipc/pull_events.ts` (31 lines): `EVENT_PULL_PROGRESS` constant + zod `PullProgressSchema` (discriminated union on `phase` field matching backend's `#[serde(tag = "phase", rename_all = "snake_case")]`) covering all 5 variants + `PullProgressEventSchema` for `{pull_id, progress}`; `PullProgress` and `PullProgressEvent` types derived via `z.infer` (single source of truth per 1.5.6's pattern). New `features/models/state/install_state.ts` (77 lines): `ModelInstallState` interface (status, phase, progress, error); pure `deriveProgress(d)` computes `percentComplete` (clamped 0-100), `etaSeconds` (capped at 99999, 0 when speed_bps==0); `applyProgress(state, progress)` maps a `PullProgress` event into the next state. New `features/models/format.ts` (28 lines): `formatBytes` ("1.3GB", "850.0MB", "999B") and `formatDuration` ("45s", "3m 24s", "1h 5m") helpers. New `features/models/hooks/useModelInstall.ts` (72 lines): mounts a single `listen("pull-progress")` subscription filtered by `pullIdRef.current` (multi-install ready); `install(name)` calls `invoke("pull_model", {name})`, stores pull_id; `cancel()` calls `invoke("cancel_pull", {pullId})` and transitions to `cancelled`; useEffect cleanup auto-cancels any in-flight install on unmount. Zod `safeParse` at the event boundary per 1.5.6 — malformed payloads `console.error` and silently drop. Tests (3 files, 29 new test cases): `install_state.test.ts` (8 tests — percent computation, clamp, divide-by-zero, ETA cap; phase transitions; success terminal); `format.test.ts` (15 tests via `it.each` — byte boundary values; duration breakpoints; fractional-second rounding); `useModelInstall.test.ts` (6 hook tests — all phases ending success; pull_id filtering; malformed payload rejected with state unchanged; cancel invokes cancel_pull with correct pullId and transitions to cancelled; unmount mid-pull auto-cancels; install rejection produces error state with message). Vitest 42→71 (+29). pnpm build clean. No backend changes.
| M.3  | UI: `AddModelModal` with tab structure                          | render + interaction test             | Tab switch preserves state; keyboard nav works       |
> M.3 — ✅ shipped 2026-05-22 (phase-m/m.3-modal-scaffold, branched from M.2-merged main). New `features/models/state/modelStore.ts` (25 lines): Zustand store with `activeTab` (zod-typed `TabId = enum["ollama","huggingface","local"]`) + `installInFlight` ({source, name, progress} \| null) + 2 setters. Follows the architecture.md Rule 6 split — modelStore owns shared cross-component state (which tab is active, what's installing), while `useModelInstall` (M.2) owns per-install ephemeral state. New `features/models/components/AddModelModal.tsx` (98 lines): controlled modal (isOpen/onClose), 720×540 centered with `bg-black/40 backdrop-blur-sm`, role="dialog" + aria-modal + aria-labelledby. Three tab buttons (role="tab", aria-selected) mapped from TABS const. Keyboard handler on `document`: Escape → onClose, Cmd+1/2/3 → setActiveTab, Tab/Shift+Tab → focus trap (querySelectorAll `'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'`; wraps last→first and first→last with preventDefault). Auto-focus first focusable via queueMicrotask on open; cleanup restores `previousFocus.current` on unmount. Footer renders `"Installing {name} · {progress}%"` from `installInFlight`. New tab placeholders (8 lines each): `OllamaLibraryTab` ("arrives in M.4"), `HuggingFaceTab` ("arrives in M.11"), `LocalFileTab` ("arrives in M.8"). `ModelPicker` (workspace feature) gains optional `onAddClick` prop — renders a `+` button next to the select; also restructured so the picker shows the `+` button even on a `listModels()` error (was a hidden gap in the picker; bumps 52→63 lines). `App.tsx` adds `[modalOpen, setModalOpen]` and wires the modal + the picker's `onAddClick`. Tests (2 files, 11 new): `modelStore.test.ts` (3 — initial state, all three setActiveTab transitions, setInstallInFlight set/clear); `AddModelModal.test.tsx` (8 — render+aria-modal+aria-labelledby; not-rendered when isOpen=false; Close click + Escape key both call onClose; tab click + Cmd+1/2/3 both update store; Tab focus trap wrap-around for both directions; correct tab content per active tab; installInFlight renders in footer; focus restoration on close). One subtle assertion lesson captured: `screen.getAllByRole("button")` excludes `<button role="tab">` (ARIA role wins); tests querying focusable elements must use `querySelectorAll("button")` like the trap itself does. Vitest 71→82 (+11). pnpm build clean (282KB→286KB after the modal + Tailwind class additions). No backend changes.
| M.4  | Ollama Library tab: search + grid + install flow                | integration test against mocked registry | Search debounced; installed state reflects reality |
> M.4 — ✅ shipped 2026-05-22 (phase-m/m.4-ollama-library, branched from M.3-merged main). New `features/models/data/ollama-catalog.json` (32 lines): 30 hand-curated catalog entries one-per-line covering all 7 tags (chat, coding, embedding, vision, small, medium, large) across Llama / Qwen / Mistral / Phi / Gemma / DeepSeek / StarCoder / CodeGemma / LLaVA / Nomic / mxbai / Snowflake families. New `features/models/data/ollama-catalog.ts` (31 lines): zod `TagSchema = enum(7 tags)`, `ModelCatalogEntrySchema` (name/family/parameterSize/description/estimatedDiskGB/tags/defaultQuantization), `OllamaCatalog` parsed at module load — schema violation throws at import so `tsc && vite build` refuses to bundle a bad catalog. New `features/models/components/ModelCard.tsx` (67 lines): renders name + sub-line + description + `{diskGB}GB`; reacts to local `useModelInstall` state — Install button → Installing · N% → Installed ✓; useEffect mirrors hook state into `modelStore.installInFlight` (drives the modal footer) and clears on transitions out of "pulling". New real `features/models/components/tabs/OllamaLibraryTab.tsx` (87 lines, replaces the M.3 placeholder): search input + 8 filter pills (All + chat/coding/embedding/vision/small/medium/large) + scrollable 2-column grid. `useMemo`-driven filter computes search-substring AND pill-intersection (multi-select). Loads installed names via `listModels()` (Set), passes `isInstalled` to each ModelCard. Tests (3 files, 14 new): `ollama-catalog.test.ts` (4 — ≥25 entries; every entry schema-parses; all 7 tags represented at least once; names unique); `ModelCard.test.tsx` (5 — fields render; installed badge replaces install button when isInstalled=true; install click invokes `pull_model` with name; downloading event renders "Installing · 25%" and writes to `modelStore.installInFlight` with rounded percent; success swaps to Installed badge and clears `installInFlight`); `OllamaLibraryTab.test.tsx` (5 — full catalog visible initially; search="llama" filters to llama-substring matches; "Coding" pill narrows to coding-tagged; search + pill intersect, not union; installed names from `listModels` render with the badge). One follow-up captured: M.3's modal test rendered the placeholder OllamaLibraryTab; after M.4 it now renders the real tab which calls `listen` per ModelCard. Test was updated to (a) mock `@tauri-apps/api/{core,event}` at module level and (b) assert `data-testid="model-grid"` for the Ollama active tab (replaces the old `data-testid="tab-ollama"` placeholder marker). Vitest 82→96 (+14). pnpm build clean. Bundle 286→299 KB (catalog + new components; gz 87→91 KB). No backend changes.
| M.5  | Storage view + uninstall command                                | round-trip test (install → list → uninstall → list) | Disk space numbers accurate ±5%; uninstall removes all files |
| M.6  | Disk-space pre-check logic                                      | unit test with various disk states    | Refuses install if <2GB free post-install; warns at <10GB |
| M.7  | Rust: GGUF file inspection (read header + metadata)             | unit test on fixture GGUF files       | Architecture, param count, quant level extracted correctly |
| M.8  | UI: Local GGUF import (drag-drop + file picker)                 | E2E test with sample GGUF             | Drop registers; metadata preview accurate; Modelfile valid |
| M.9  | Chat template registry + family detection                       | unit test on 20 known model names     | Correct template returned; unknown families surface warning |
| M.10 | Rust: HF download with resume support                           | mockito + integration test            | Download resumes after interruption; SHA256 verified |
| M.11 | UI: Hugging Face browser tab                                    | render + search test                  | Results paginated; filter pills work; auth-required state visible |
| M.12 | Rust: Modelfile generation + `ollama create` wrapper            | round-trip test                       | Generated Modelfile loads in Ollama without error    |
| M.13 | Settings: model storage path override                           | settings persistence test             | Custom path honored; warns if path unwritable        |
| M.14 | E2E smoke: install from each source + uninstall                 | manual + scripted                     | All 3 sources work end-to-end; cleanup leaves no residue |
| M.15 | Polish pass: error states, empty states, loading skeletons      | manual audit                          | Every failure mode has actionable user message       |

After each step, append a one-line note under that row: status
(✅ shipped / ⏳ in progress) + commit SHA + date. Same convention as
`02_phase1_implementation.md`.

---

## Step M.1 — Rust streaming pull command

**Goal.** A `pull_model(name: String)` Tauri command that wraps
Ollama's `POST /api/pull` endpoint and streams progress events back
to the frontend.

**Implementation outline.**

1. In `src-tauri/src/inference/ollama.rs`, add:

   ```rust
   pub async fn pull_model(
       endpoint: &str,
       name: &str,
       on_progress: impl Fn(PullProgress) + Send + 'static,
       cancellation: tokio_util::sync::CancellationToken,
   ) -> Result<(), AppError>
   ```

   POSTs to `{endpoint}/api/pull` with body `{"name": name, "stream": true}`.
   Ollama responds with newline-delimited JSON:
   - `{"status": "pulling manifest"}`
   - `{"status": "pulling <digest>", "digest": "sha256:...", "total": <bytes>, "completed": <bytes>}`
   - `{"status": "verifying sha256 digest"}`
   - `{"status": "writing manifest"}`
   - `{"status": "success"}`

2. `PullProgress` is a serde-serializable enum:

   ```rust
   pub enum PullProgress {
       PullingManifest,
       Downloading { digest: String, total: u64, completed: u64, speed_bps: u64 },
       Verifying,
       Writing,
       Success,
   }
   ```

3. `speed_bps` is a moving average over the last 5 seconds. Maintain
   a small ring buffer of `(timestamp, bytes_completed)` tuples.

4. In `src-tauri/src/commands/models.rs`:

   ```rust
   #[tauri::command]
   pub async fn pull_model(
       window: tauri::Window,
       state: tauri::State<'_, AppState>,
       name: String,
   ) -> Result<String, AppError>
   ```

   Generates a `pull_id` (UUID), stores a `CancellationToken` in
   `state.active_pulls` (`Mutex<HashMap<String, CancellationToken>>`),
   spawns a task that emits `"pull-progress"` events on the window with
   payload `{pull_id, progress}`, returns `pull_id` immediately.

5. `cancel_pull(pull_id: String)` looks up the token and cancels it.

6. Register both commands in `main.rs`. Add `tokio_util` to `Cargo.toml`.

**Test cases.**

- Unit: `PullProgress` enum serializes to correct JSON shape (matches frontend zod schema).
- Unit: Speed calculation returns 0 with only one data point; correct moving average with 5+.
- Mockito integration: full pull sequence emits 6 events in order, last is `Success`, total bytes match.
- Mockito integration: 500 response from Ollama produces `AppError::Inference` with status code.
- Cancellation: inject token cancelled after 2nd `Downloading` event; task exits clean, no further events.

**Data validation.**

- `name`: non-empty, no whitespace, no path separators, no quote characters. Reject upfront with `AppError::Validation`.
- Ollama responses parsed with `#[serde(deny_unknown_fields)]` on each variant struct.
- `total`/`completed` are `u64` (non-negative). If `completed > total`, log warning, don't crash — Ollama sometimes reports slightly more than total.

**Data quality.**

- Progress monotonicity: within a single download (same digest), `completed` only increases across events. Replay a recorded real pull, assert.
- Speed accuracy: fake timestamps such that 1MB was downloaded in 1 second; assert `speed_bps` within 5% of 1,048,576.
- No phantom progress after cancel: count events received before and after cancellation timestamp.

**Acceptance.**

- [ ] `cargo test` passes including all cases above.
- [ ] Manual against real Ollama: `pull_model("phi3.5:latest")` emits events, completes, model appears in `list_models`.
- [ ] Cancellation tested manually: pull a large model, cancel halfway.
- [ ] No `unwrap()` in production paths.

Time estimate: 2–3 evenings.

---

## Step M.2 — Frontend pull hook

**Goal.** A `useModelInstall` hook that wraps `pull_model` and exposes status/progress/cancel to UI components.

**Implementation outline.**

1. `src/features/models/hooks/useModelInstall.ts`:

   ```ts
   export interface ModelInstallState {
     status: 'idle' | 'pulling' | 'success' | 'error' | 'cancelled';
     phase: 'manifest' | 'downloading' | 'verifying' | 'writing' | null;
     progress?: {
       bytesCompleted: number;
       bytesTotal: number;
       speedBps: number;
       percentComplete: number;
       etaSeconds: number;
     };
     error?: string;
   }

   export function useModelInstall(): {
     state: ModelInstallState;
     install: (name: string) => Promise<void>;
     cancel: () => Promise<void>;
   }
   ```

2. `install` calls `invoke('pull_model', { name })`, gets back a `pull_id`, subscribes to `"pull-progress"` events filtered by that id.

3. `percentComplete = clamp((bytesCompleted / bytesTotal) * 100, 0, 100)`.
4. `etaSeconds = (bytesTotal - bytesCompleted) / speedBps` (0 when `speedBps` is 0); cap at 99999.
5. Format helpers for bytes (`1.3GB`, `850MB`) and durations (`3m 24s`, `45s`).
6. `src/shared/ipc/schemas.ts`: zod schemas for `PullProgress` variants. Validate every event.
7. `cancel` calls `invoke('cancel_pull', { pullId })`, sets status to `'cancelled'`.
8. On unmount, auto-cancel any in-flight install.

**Test cases.**

- Hook unit: fire full event sequence; verify state transitions idle → pulling(manifest) → pulling(downloading) → pulling(verifying) → pulling(writing) → success.
- Hook unit: fire Ollama error; status → error with message.
- Hook unit: call cancel during pulling; status → cancelled, pull_id passed to `cancel_pull`.
- Hook unit: unmount during pulling; `cancel_pull` called automatically.
- Schema validation: malformed event (missing `total`) rejected; hook stays in current state, no crash.

**Data validation.**

- Every event payload validated through zod before touching state. Failed validation logs warning (not user-facing), ignored.
- `percentComplete` clamped to `[0, 100]`.
- `etaSeconds` capped at 99999 to prevent "ETA: 14 years" displays from transient speed drops.

**Data quality.**

- No phantom updates after cancellation: simulate cancel called and an event arriving 50ms later. State must NOT update. Test with mocked `invoke('cancel_pull')` with 100ms delay.
- Progress monotonicity in UI: `percentComplete` never decreases across events for the same install. Dev-mode assertion.
- Format consistency: byte formatter produces `"1.3GB"` (one decimal, no space). Test edges: 0, 999, 1024, 1,048,576, 1,073,741,824.

**Acceptance.**

- [ ] All vitest cases pass; hook coverage >80%.
- [ ] Manual: instrument `console.log`, run a real pull, observe sane progress.
- [ ] No memory leaks: mount/unmount 50 times; listener count returns to baseline.

Time estimate: 1–2 evenings.

---

## Step M.3 — `AddModelModal` scaffolding

**Goal.** The modal that opens when a user clicks "+" next to the model picker. Tabs for the three sources. State shared across tabs.

**Implementation outline.**

1. `src/features/models/components/AddModelModal.tsx`:
   - Controlled component, `isOpen` prop + `onClose` callback.
   - Centered overlay with backdrop blur.
   - Header: "Add Model" + close button.
   - Tab bar: "Ollama Library", "Hugging Face", "Local File".
   - Footer with a small status line showing any in-flight install across tabs.

2. Each tab renders a placeholder div for now. Real impls in M.4/M.8/M.11.

3. Keyboard: Escape closes; Tab cycles through tab buttons then into content; Cmd+1/2/3 switches tabs.

4. Zustand store at `src/features/models/state/modelStore.ts`:
   - `activeTab: 'ollama' | 'huggingface' | 'local'`
   - `installInFlight: { source: string, name: string, progress: number } | null`
   - `setActiveTab`, `setInstallInFlight`.

5. Wire "+" on `ModelPicker` to open this modal.

6. Tailwind. Modal 720×540, centered. Reuse tokens from `src/shared/styles/tokens.css`.

7. Focus trap so keyboard nav stays inside the modal when open.

**Test cases.**

- Renders when `isOpen=true`, not when `false`.
- Clicking X calls `onClose`.
- Escape calls `onClose`.
- Clicking each tab updates store.
- Cmd+1/2/3 switch tabs.
- Tab key cycles buttons; doesn't escape modal.
- Store: `setInstallInFlight` updates state; clearable with null.

**Data validation.**

- `activeTab` restricted to the three values via TS and zod.
- Modal props validated at component boundary.

**Data quality.**

- Accessibility: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title. axe-core or manual VoiceOver.
- Focus restoration: opening stores previously-focused element; closing restores. Test "+" → modal → close → "+" focused.
- No double-render of overlays: toggle `isOpen` 10× rapidly; exactly 0 or 1 `.modal-overlay` in DOM.

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: open, switch tabs, close, focus returns.
- [ ] Keyboard-only nav works.
- [ ] No layout shift when modal opens (`position: fixed` on overlay).

Time estimate: 1–2 evenings.

---

## Step M.4 — Ollama Library tab (search + install)

**Goal.** First functional tab: search box + grid of model cards + install buttons wired to M.1 via M.2.

**Implementation outline.**

1. `OllamaLibraryTab.tsx`:
   - Search input ("Search Ollama library...").
   - Filter pills: All, Coding, Chat, Embedding, Vision, Small (<4B), Medium (4–13B), Large (>13B).
   - Scrollable grid of `ModelCard`.

2. v0.2: hardcode catalog at `src/features/models/data/ollama-catalog.json` (~30 popular models):

   ```json
   { "name": "llama3.3:8b", "family": "llama", "parameterSize": "8B",
     "description": "...", "estimatedDiskGB": 4.9,
     "tags": ["chat", "medium"], "defaultQuantization": "Q4_K_M" }
   ```

   Source from `https://ollama.com/library`. Real-time registry fetching deferred to Phase 5.

3. `ModelCard.tsx`:
   - Name, family + param size + quant on a sub-line, description, estimated disk, install button OR "Installed ✓" badge OR progress bar.
   - Installed-check computed by intersecting with `list_models`.
   - Install button calls `useModelInstall().install(model.name)`.

4. Search: case-insensitive substring on name + description + tags.

5. Filter pills: toggle-style, multi-select, intersection with search.

6. During install: footer reads `"Installing llama3.3:8b · 47% · 2m 18s remaining · [Cancel]"`.

7. On success: refresh installed list, brief success toast, modal stays open.

**Test cases.**

- Renders all catalog entries when no search/filter.
- Search "llama" filters to Llama family.
- "Coding" pill filters to coding-tagged.
- Search + pills work as intersection.
- Already-installed models show badge.
- Install transitions card to in-progress.
- Mocked IPC: full install flow updates card through pulling → success.

**Data validation.**

- Catalog JSON validated against zod schema on import; build fails on schema violation.
- Search sanitized — use plain `includes()`, no regex.
- Filter pill values validated against catalog's actual tag set.

**Data quality.**

- Catalog accuracy: every `estimatedDiskGB` within 10% of actual download. Verify periodically.
- No stale "installed" state: badge appears within 2s after install, disappears within 2s after uninstall.
- Search responsiveness: type in search; grid filters within 100ms even with 200+ entries. React Profiler.

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: search "qwen", install one, verify in main picker.
- [ ] Manual: install, cancel halfway; card returns to "Install"; no partial files.
- [ ] Catalog has ≥25 entries across all tag categories.

Time estimate: 2–3 evenings.

---

## Step M.5 — Storage view + uninstall

**Goal.** View showing all installed models with sizes, last-used timestamps, uninstall buttons. The "where did my disk go?" answer.

**Implementation outline.**

1. `src-tauri/src/commands/models.rs`:
   - `get_installed_models_with_stats() -> Result<Vec<InstalledModelInfo>, AppError>` — name, size_bytes, modified_at, family, quantization. Pulls `/api/tags` (from step 1.5) + enriches with details.
   - `remove_model(name: String) -> Result<(), AppError>` — `DELETE /api/delete` with `{"name": name}`.
   - `get_disk_usage() -> Result<DiskUsage, AppError>` — total_bytes, free_bytes, ollama_models_bytes (sum).

2. `StorageView.tsx`:
   - Top: disk summary "Models: 12.4GB / Free: 84.3GB on disk".
   - Visual: horizontal bar used/free.
   - Below: list of installed models, sorted by size desc.
   - Each row: name, size, family, quant, last modified, uninstall button.
   - Uninstall opens confirm: "Remove llama3.3:8b? This will free 4.9GB."

3. After successful uninstall: refresh list, brief toast.

4. Add "Storage" tab to Settings page (if step 1.9 settings exists; else new Settings view).

**Test cases.**

- Rust: `get_installed_models_with_stats` parses mock `/api/tags` including `details`.
- Rust: `remove_model` sends correct DELETE body; handles 404 as `AppError::NotFound`.
- Rust: `get_disk_usage` computes free bytes via `sysinfo` (or similar).
- Component: storage view renders with mock data; uninstall opens confirm dialog.
- Component: after uninstall confirm, row disappears.
- Integration: install small model → appears → uninstall → disappears → disk free increases.

**Data validation.**

- Model sizes non-negative. If Ollama returns 0, log warning, display "Unknown size".
- Disk percentages clamped to `[0, 100]`.
- Confirm dialog requires explicit click — no auto-confirm on Enter.

**Data quality.**

- Size accuracy: reported total per model matches actual disk usage of that model's blobs in `~/.ollama/models/blobs`. Compare OS-reported size; ±1% variance.
- No stale data after uninstall: subsequent `get_installed_models_with_stats` does NOT include removed model.
- Disk usage refresh: re-queried after each uninstall, not cached. Verify number changes.

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: 3 models installed; verify sizes match `du -sh ~/.ollama/models/blobs/*`.
- [ ] Manual: uninstall a model; gone from view AND `ollama list`; disk reclaimed.
- [ ] Confirm dialog cannot be bypassed accidentally.

Time estimate: 1–2 evenings.

---

## Step M.6 — Disk-space pre-check

**Goal.** Before install, check free disk space. Refuse if install would leave <2GB free. Warn (but allow) if <10GB.

**Implementation outline.**

1. `check_install_feasibility(estimated_size_bytes: u64) -> Result<InstallFeasibility, AppError>` where

   ```rust
   enum InstallFeasibility {
       Ok,
       Warning { free_after_bytes: u64 },
       BlockedInsufficientSpace { free_after_bytes: u64 },
   }
   ```

   Logic: free space − estimated size. <2GB → block. <10GB → warning. Else → Ok.

2. In every install path (Ollama tab + later HF + Local): call before install. Show appropriate UI: proceed / "Continue?" / hard block.

3. `estimatedDiskGB` is a *minimum*. Add 5% safety margin.

**Test cases.**

- Free 100GB, install 5GB → Ok.
- Free 12GB, install 5GB → Warning (7GB after).
- Free 3GB, install 5GB → BlockedInsufficientSpace.
- Free 0 → BlockedInsufficientSpace.
- UI: mock each variant; verify correct UI shown.

**Data validation.**

- `estimated_size_bytes` > 0. Zero treated as "unknown size", skip pre-check with warning.
- Free-space query validated ≥ 0.

**Data quality.**

- Realistic safety margin: document why 5% / 2GB / 10GB. 2GB minimum accounts for OS swap and app caches; 10GB warning covers user's other work in the next week.
- Query freshness: query at install time, not from app-startup cache. Test by changing free space externally between checks.

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: simulate low-disk; verify block behavior.
- [ ] Block/warning messages are clear and actionable.

Time estimate: 1 evening.

---

## Step M.7 — GGUF file inspection

**Goal.** Read a `.gguf` file directly, extract metadata (architecture, parameter count, quantization, context length) without invoking Ollama or any external tool.

**Implementation outline.**

Reference: <https://github.com/ggerganov/ggml/blob/master/docs/gguf.md>

GGUF v3 file structure: magic `"GGUF"` (4 bytes), version (u32), tensor count (u64), metadata KV count (u64), metadata KV pairs, tensor info, tensor data. We only need the metadata section.

1. `src-tauri/src/inference/gguf.rs`:

   ```rust
   pub struct GgufMetadata {
       pub architecture: String,
       pub parameter_count: Option<u64>,
       pub context_length: Option<u32>,
       pub quantization: Option<String>,
       pub family: Option<String>,
   }

   pub fn inspect_gguf(path: &Path) -> Result<GgufMetadata, AppError>
   ```

2. Parse only the header — first ~64KB. Do not read the whole multi-GB file.

3. Metadata values are typed (string, u32, u64, f32, bool, array). Implement a typed-value reader.

4. Quantization detection priority:
   1. If `general.file_type` metadata is present, map enum → `Q4_K_M` etc.
   2. Else regex match filename for known patterns.
   3. Else `None`.

5. Family inference from architecture:
   - `llama` → Llama; `qwen2` → Qwen 2; `qwen3` → Qwen 3; `mistral` → Mistral; `phi3` → Phi-3; `gemma` → Gemma.
   - Unknown → architecture as-is.

**Test cases.**

- Parse a known-good GGUF fixture (committed; ideally a stub GGUF with only metadata).
- Reject file without `"GGUF"` magic → `AppError::Validation("not a GGUF file")`.
- Reject unsupported versions.
- Handle truncated file → clear error.
- Filename-based quant: `llama3-q4_k_m.gguf` → Q4_K_M; `model.Q5_K_M.gguf` → Q5_K_M; `random-name.gguf` → None.
- Family mapping across the 6+ supported architectures.

**Data validation.**

- Path exists, readable, ends in `.gguf` (case-insensitive).
- File size ≥ 64KB (anything smaller can't be a real GGUF model).
- Magic bytes exactly `"GGUF"`. Handle endianness from version field.

**Data quality.**

- Parameter count accuracy: matches HuggingFace model card within 1%. Test against 3 fixtures.
- Quant detection robustness: test against 20+ real-world filenames. Document handled patterns.
- No false positives: a renamed `.txt` rejected, not silently parsed as garbage.

**Acceptance.**

- [ ] All unit tests pass.
- [ ] Manual: download a real GGUF; `inspect_gguf` output matches model card.
- [ ] All known GGUF versions handled (or explicitly rejected with clear error).

Time estimate: 2–3 evenings (deepest binary parsing in the codebase).

---

## Step M.8 — Local file import UI

**Goal.** Drag-and-drop or file-picker import of a local GGUF. Auto-detect metadata via M.7. Generate Modelfile via M.12. Register with Ollama.

**Implementation outline.**

1. `LocalFileTab.tsx`:
   - Large drop zone with text "Drag a .gguf file here, or click to browse".
   - "Browse files..." button → system file picker (filter to `.gguf`).

2. On file selection:
   1. `invoke('inspect_gguf', { path })` (new Tauri command wrapping M.7).
   2. Confirmation card: "Import [filename]? Detected: [family] [params] [quant]. Save as model name: [editable input pre-filled with sanitized filename]".
   3. User edits name; must match Ollama's naming rules.
   4. Click "Import" → `invoke('install_local_gguf', { path, name })` (uses M.12).
   5. Show progress (manifest creation is fast; mostly spinner).
   6. On success: refresh picker, toast.

3. Drag-and-drop at the modal level (not just the tab). Dropping a file anywhere switches to Local tab.

4. Reject non-`.gguf` drops with clear inline message.

5. Name conflict prompt: "A model named X already exists. Replace? / Choose a different name."

**Test cases.**

- Drop zone handles enter/leave/over/drop.
- Non-`.gguf` drop shows error.
- Valid drop → `inspect_gguf` → confirmation card.
- Invalid name chars rejected inline.
- Mocked `inspect_gguf` + `install_local_gguf`: full flow.

**Data validation.**

- File path exists, readable, before `invoke` calls.
- Proposed name validated against Ollama's rules (`a-zA-Z0-9_\-.:`, max 64 chars).
- Conflict check against current installed list.

**Data quality.**

- Drag reliability: from Finder, Chrome downloads, desktop — all work.
- No file path leaks: only filename shown in UI (privacy in screenshots).
- Idempotency: importing same file twice with same name is safe (Ollama handles dup or Quatamind prompts to replace).

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: drag a 2GB GGUF from HF; successful import.
- [ ] Manual: drag renamed `.txt` → `.gguf`; rejected.
- [ ] Unicode filenames handled correctly.

Time estimate: 2 evenings.

---

## Step M.9 — Chat template registry

**Goal.** Detect chat template format for a given model family, return correct `TEMPLATE` string for generated Modelfiles. Wrong template → garbage output.

**Implementation outline.**

1. `src-tauri/src/inference/chat_templates.rs`:

   ```rust
   pub struct ChatTemplate {
       pub family: &'static str,
       pub template_string: &'static str,
       pub stop_tokens: &'static [&'static str],
   }

   pub fn detect_template(model_name: &str, architecture: Option<&str>) -> Option<ChatTemplate>
   ```

2. Maintain a static registry for these families (research each — don't guess):
   - Llama 3 / 3.1 / 3.2 / 3.3 (same template).
   - Qwen 2 / 2.5 / 3.
   - Mistral (7B Instruct, Small 3).
   - Phi-3 / Phi-3.5.
   - Gemma 2 / Gemma 3.
   - Command-R / Command-R+.
   - DeepSeek (V2, V3).
   - Yi.

3. Detection priority:
   1. Architecture from GGUF metadata (most reliable).
   2. Substring match on model name (e.g., `llama-3` → Llama 3).
   3. `None` (caller surfaces warning).

4. Source each template from the model's HF `tokenizer_config.json` or `chat_template` field. Do not guess.

5. Unit test every family with ≥3 model-name variants each.

**Test cases.**

- Per family: variants like `llama3.2:1b`, `llama-3.1-8b-instruct`, `meta-llama-3-70b` all resolve to Llama 3.
- Architecture-based detection when name is non-standard.
- Unknown family → `None`.
- Template strings round-trip serde without escape issues.

**Data validation.**

- Template strings contain `{{ .System }}`, `{{ .Prompt }}`, `{{ .Response }}` where applicable.
- Stop tokens non-empty.

**Data quality.**

- Per family: install a known model, run a test prompt, verify clean output (no `<|user|>` leakage). Manual gate; automate later.
- Maintain "personally verified" vs "trusted by family pattern" list in source comments.

**Acceptance.**

- [ ] All unit tests pass.
- [ ] Manual per family: Llama 3, Qwen 2.5, Mistral, Phi-3, Gemma 2 — clean output.
- [ ] Unknown-family warning appears in UI when detection fails.

Time estimate: 2 evenings (research per family is the slow part).

---

## Step M.10 — Hugging Face download

**Goal.** Download a GGUF from a HF repo URL. Resume if interrupted. Verify SHA256 if provided.

**Implementation outline.**

1. `src-tauri/src/inference/huggingface.rs`:

   ```rust
   pub async fn download_gguf(
       repo: &str,
       filename: &str,
       dest_path: &Path,
       on_progress: impl Fn(DownloadProgress),
       cancellation: CancellationToken,
   ) -> Result<DownloadResult, AppError>
   ```

2. URL: `https://huggingface.co/{repo}/resolve/main/{filename}`.

3. Resume:
   - If `dest_path` exists, HEAD request for full size.
   - Local smaller → Range request from local size.
   - Local equal → skip (treat as done).
   - Local larger → delete, restart.

4. Save to `.partial` suffix during download; atomic rename on completion.

5. SHA256: if sibling `{filename}.sha256` exists in repo, fetch and verify.

6. Rate limit: respect HF headers. 429 → wait, retry once. Still 429 → fail with clear error.

7. Auth: 401/403 → `AppError::AuthRequired` with helpful message. Phase M doesn't support tokens (Phase 5).

**Test cases.**

- Mockito: full chunked download; correct events; file written; complete.
- Mockito: resume — partial file present; Range request with correct offset.
- Mockito: cancel mid-download; task exits; `.partial` remains for resume.
- Mockito: 401 → `AppError::AuthRequired`.
- Mockito: 404 → `AppError::NotFound`.
- Mockito: corrupted local (size > expected) → deleted, re-downloaded.
- Integration: download a small public GGUF from HF.

**Data validation.**

- Repo: `{namespace}/{repo-name}`.
- Filename ends in `.gguf`.
- Dest path writable.
- Downloaded bytes never exceed `Content-Length`.

**Data quality.**

- Atomic completion: final filename appears only after full download. Kill mid-download → only `.partial` exists.
- Resume correctness: download, kill at 50%, resume; final SHA256 matches a fresh full download.
- Progress accuracy: total bytes reported = actual bytes received. No overcounting from retries.

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: real 1–2GB GGUF; cancel halfway; `.partial` exists; resume succeeds.
- [ ] Manual: gated model → clear AuthRequired error.
- [ ] Bandwidth doesn't spike to 100% — conservative reqwest connection pool.

Time estimate: 3–4 evenings.

---

## Step M.11 — Hugging Face browser tab

**Goal.** UI side of HF. Search GGUF repos. Display variants. Trigger downloads via M.10. Register via M.12.

**Implementation outline.**

1. `HuggingFaceTab.tsx`, two sub-modes:
   1. Search mode (default): search bar + grid of popular GGUF repos.
   2. Direct URL mode: paste a HF repo URL or `namespace/repo`.

2. v0.2: hardcode at `src/features/models/data/huggingface-catalog.json` (20–30 popular GGUF repos: bartowski, QuantFactory, lmstudio-community, etc.).

   ```json
   { "repo": "bartowski/Llama-3.3-8B-Instruct-GGUF",
     "baseModel": "Llama 3.3 8B Instruct", "family": "llama",
     "description": "...", "popularity": "high" }
   ```

3. Click a repo / paste URL → detail view:
   - Repo name, base model, license (HF API).
   - Variant table: Filename | Quantization | Size | Quality estimate. Each row has Install.

4. Variants come from `GET https://huggingface.co/api/models/{repo}/tree/main`. Filter to `.gguf`.

5. Quality estimate static mapping: Q8_0 → "Best quality"; Q5_K_M → "Recommended"; Q4_K_M → "Balanced"; Q3_K_M → "Small"; Q2_K → "Lowest quality, fastest".

6. Install flow:
   1. Disk pre-check (M.6).
   2. Download GGUF (M.10) with progress.
   3. Inspect downloaded file (M.7).
   4. Generate Modelfile (M.12) with template (M.9).
   5. Register via `ollama create`.
   6. Refresh picker.

7. Cancel available throughout; cleanup partial downloads on cancel.

**Test cases.**

- Search filters static catalog.
- URL paste parses both `https://huggingface.co/ns/repo` and `ns/repo`.
- Variant list from mock tree API.
- Install transitions: downloading → inspecting → generating modelfile → registering → success.
- Mocked HTTP: full flow; model appears in installed list.

**Data validation.**

- Repo: `^[a-zA-Z0-9_\-.]+/[a-zA-Z0-9_\-.]+$`.
- URLs sanitized — strip query params and fragments.
- Variant sizes are positive ints.

**Data quality.**

- Variant size matches actual download size (HF tree API vs Content-Length on actual download).
- Quality estimates documented in code with methodology; link to benchmark.
- Restrictive licenses shown prominently before install.

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: install a Llama 3 GGUF; clean output (validates M.9).
- [ ] Manual: install a Qwen 2.5 GGUF.
- [ ] Manual: gated repo → clear auth-required error.
- [ ] Catalog has ≥20 entries across 5+ families.

Time estimate: 3–4 evenings.

---

## Step M.12 — Modelfile generation + `ollama create` wrapper

**Goal.** Given a GGUF path and detected metadata, generate a valid Modelfile and call `ollama create` to register.

**Implementation outline.**

1. `src-tauri/src/inference/modelfile.rs`:

   ```rust
   pub struct ModelfileSpec {
       pub gguf_path: PathBuf,
       pub chat_template: Option<ChatTemplate>,
       pub parameters: ModelfileParameters,
   }

   pub struct ModelfileParameters {
       pub temperature: Option<f32>,
       pub top_p: Option<f32>,
       pub top_k: Option<u32>,
       pub repeat_penalty: Option<f32>,
       pub stop: Vec<String>,
   }

   pub fn generate_modelfile(spec: &ModelfileSpec) -> String
   ```

2. Output:

   ```
   FROM /absolute/path/to/model.gguf

   # If chat_template is Some:
   TEMPLATE """<template string>"""

   # If parameters set, one PARAMETER per:
   PARAMETER temperature 0.7
   PARAMETER top_p 0.9
   PARAMETER stop "<|eot_id|>"

   # If chat_template is None: no TEMPLATE line; surface UI warning.
   ```

3. Multi-line template strings use Ollama's `"""` raw-string syntax.

4. Escape `"` and `"""` inside template/stop tokens.

5. `commands/models.rs::install_model_from_gguf`:

   ```rust
   #[tauri::command]
   pub async fn install_model_from_gguf(
       name: String,
       gguf_path: String,
       parameters: Option<ModelfileParameters>,
   ) -> Result<(), AppError>
   ```

   1. Inspect GGUF (M.7) for architecture.
   2. Detect template (M.9) using arch and filename.
   3. Build `ModelfileSpec`, generate text.
   4. Write to temp file (`/tmp/quatamind-modelfile-<uuid>`).
   5. `POST /api/create` with `{ name, modelfile: <contents> }`.
   6. Stream create progress (Ollama returns NDJSON like `/api/pull`).
   7. Cleanup temp file.
   8. Return on success or propagate error.

**Test cases.**

- Modelfile generation: minimal spec; full spec; spec with no template.
- Special char escaping in template strings.
- Full `install_model_from_gguf` round-trip with a small real GGUF → appears in `ollama list`.
- Failed `ollama create` → clear error.
- Temp file cleaned up on success and failure.

**Data validation.**

- Model name validated against Ollama rules.
- Parameters in sensible ranges (temp 0–2, top_p 0–1, etc.).
- GGUF path absolute and exists.

**Data quality.**

- Generated Modelfile is valid Ollama syntax — feed 5 different generated files to `ollama create`, all succeed.
- Template fidelity: same model under Quatamind's TEMPLATE vs vLLM/transformers with same template → same behavior. Hard to fully test; verify a known test prompt produces coherent response.
- No temp file leaks: 100 invocations leaves no leftovers in `/tmp`.

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: install via HF flow; clean output.
- [ ] Manual: install same model via local flow; same clean output (cross-source consistency).

Time estimate: 2 evenings.

---

## Step M.13 — Custom storage path

**Goal.** Override where models are stored. Some users have fast NVMe at one path and large HDD at another.

**Implementation outline.**

1. Detect current path from `OLLAMA_MODELS` env or platform default:
   - macOS: `~/.ollama/models`
   - Linux: `/usr/share/ollama/.ollama/models`
   - Windows: `C:\Users\<user>\.ollama\models`

2. Settings page "Model Storage" section:
   - Current path (read-only).
   - "Change..." button → directory picker.
   - Warning: "Changing storage path requires restarting Ollama. Existing models will need to be re-downloaded unless you move them manually."

3. On path change:
   - Validate: exists, writable, ≥50GB free.
   - Write `OLLAMA_MODELS` env to shell profile (`.zshrc` etc.) — with user confirmation.
   - Post-action: "Restart Ollama: `pkill ollama && ollama serve`".

4. Quatamind does NOT move existing models — out of scope.

**Test cases.**

- Default path detection per OS.
- Path validation (exists, writable, sufficient space).
- Settings UI: change → picker → warning dialog → confirmation.
- Setting persists across app restarts.

**Data validation.**

- Path: absolute, existing directory, writable by current user.
- Refuse paths inside app bundle or system directories.

**Data quality.**

- Setting persistence: change, restart, verify.
- Honest UX: Quatamind cannot move existing models. Document clearly.

**Acceptance.**

- [ ] All tests pass.
- [ ] Manual: change path, restart, persist verified.
- [ ] Warning messages accurate and actionable.

Time estimate: 1 evening.

---

## Step M.14 — End-to-end smoke

**Goal.** Validate the whole Phase M as integrated experience. The "ready to launch v0.2" gate.

Execute in order. Manual. Production build. Mac mini.

1. **Fresh start.** Quit Quatamind. Delete `~/.ollama/models/blobs/*` (or fresh Ollama install). `ollama list` shows nothing. Open Quatamind. Picker empty with "No models installed — click + to install".

2. **Ollama Library install.** `+` → Ollama Library → search "phi" → phi3.5 → Install. Watch progress. Wait for completion. Close modal. Verify in main picker. Select, run test prompt. Clean output.

3. **Hugging Face install.** `+` → Hugging Face → search "qwen" → Qwen 2.5 GGUF repo → Q4_K_M variant → Install. Watch progress (4GB or so). Verify in picker with correct family. Run test prompt. Clean output with no template token leakage.

4. **Local file import.** Drag a `.gguf` file from Finder onto Quatamind. Modal auto-opens to Local File tab. Verify metadata preview accurate. Edit name. Click Import. Verify registration. Run a prompt.

5. **Storage view.** Settings → Storage. All three models with correct sizes. Total matches `du -sh ~/.ollama/models/blobs`. Uninstall the largest. Confirm. Disappears from view AND main picker. Disk free increases.

6. **Cancellation.** Start installing a large model. After 30s, Cancel. Install stops. No partial files. Not in picker. Try installing same model again — starts fresh, not "resuming".

7. **Disk space block.** Fill disk to within 1GB of capacity. Try install. Block message with accurate free-space numbers. Free space. Retry succeeds.

8. **Error states.** `pkill ollama`. Try install. Clear error: "Ollama is not running. Start Ollama and try again." Restart Ollama. Retry succeeds.

**Acceptance.**

- [ ] All 8 scenarios pass without intervention.
- [ ] No crashes.
- [ ] No orphaned files (.partial, temp Modelfiles).
- [ ] All error messages actionable.

Time estimate: 1 evening (mostly waiting on downloads).

---

## Step M.15 — Polish pass

**Goal.** Same as Phase 1's polish but for model management surface.

**Audit checklist.**

- [ ] Every install/uninstall confirmation has clear language.
- [ ] Loading skeletons (not spinners) for catalog grids.
- [ ] Empty states with helpful copy ("No installed models yet — click + to add one").
- [ ] Error states with retry buttons where possible.
- [ ] Keyboard nav works for all flows.
- [ ] Touch/click targets ≥44px tall.
- [ ] Modal closes cleanly on Escape, click-outside, X.
- [ ] No console errors during normal flows.
- [ ] No `unwrap()` in Rust paths reachable from user actions.
- [ ] Localized strings ready for i18n (later phase, structure should support).

Time estimate: 2 evenings.

---

## Total Phase M estimate

- Pure coding: 22–29 evenings (~50–65 hours).
- Polish + testing: 4–5 evenings (~12–15 hours).
- Total: 26–34 evenings, ~62–80 hours. At 15 hours/week part-time, 4–5 weeks.

If launch timeline matters more than completeness: ship M.1–M.8 first (Ollama Library + Local File only) and ship HF support as a Phase M.5 follow-up. HF is where most complexity lives.

## Branching

Branch per step: `phase-m/m.1-pull-command`, `phase-m/m.2-install-hook`, …
One PR per step. PR description ends with "Closes step M.N".

## Prerequisites

- Phase 1 shipped and stable (`02_phase1_implementation.md`).
- All Phase 1 tests still passing on `main`.
- `cargo` on PATH for non-interactive shells (see `setup.md` note).
- Ollama installed and reachable.
- At least one model pulled for tests.

## What changes in other docs after this phase

- `phase-roadmap.md`: remove "Pull from Ollama registry" and "Local GGUF import" from Phase 5 if/when added — done here. Phase 5 becomes "MLX backend + smart recommendations" only.
- `test framework doc`: add the GGUF fixture (committed binary or generation script). Add HF mockito recordings.
- Optional: nightly job that re-runs M.14 smoke against a real Ollama.

## One thing to internalize before starting Phase M

This phase adds substantial surface area. You're now responsible for:

- Network reliability (downloads fail in many ways).
- Disk management (running out of space, permissions, slow disks).
- Model format compatibility (GGUF versions, edge-case quantizations).
- Chat template accuracy (wrong template = bad outputs = user thinks Quatamind is broken).
- Cross-source consistency (Ollama vs HF vs local should behave identically).

Each is a permanent support burden. The alternative — staying with
"use the terminal for model management" — is a valid product choice.
If you commit to Phase M, commit fully. Half-implemented model
management is worse than none.
