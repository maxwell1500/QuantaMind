# QuantaMind v0.1.0 — end-to-end feature overview

This document is the canonical reference for everything shipped. Five user-facing features
plus a handful of drive-by hygiene fixes. Code paths and file names
are quoted so you can grep from here straight into the codebase.

## Table of contents

1. [Per-model temperature (persisted)](#1-per-model-temperature-persisted)
2. [Ollama server controls (Start / Stop / Install)](#2-ollama-server-controls-start--stop--install)
3. [`ollama.com/library` opens in the system browser](#3-ollamacomlibrary-opens-in-the-system-browser)
4. [In-app feedback (button + modal → Web3Forms)](#4-in-app-feedback-button--modal--web3forms)
5. [Drive-by fixes (branding, gitignore)](#5-drive-by-fixes-branding-gitignore)
6. [Files added or modified](#6-files-added-or-modified)
7. [How to verify each feature](#7-how-to-verify-each-feature)
8. [What is intentionally out of scope](#8-what-is-intentionally-out-of-scope)

---

## 1. Per-model temperature (persisted)

### What the user sees

Workspace → ModelPicker now has a small gear icon to the right of the
model dropdown. Click it → a popover opens with a Temperature slider
(0.0 – 2.0, default 0.7), a live numeric readout, and a Reset button
that snaps back to 0.7. Drag the slider; on pointer-up the value is
persisted to disk and applied to every subsequent run of that model.
Closing the popover (outside-click or Esc) doesn't drop the value.

The gear is disabled when no model is selected. Tooltip on the
disabled state says "Pick a model first."

### Why it matters end-to-end

Every call to `/api/generate` used to go out with no `options.temperature`
field, so Ollama applied its built-in default for every prompt and the
user had no knob. Now both single-model runs (Workspace) and
multi-model runs (Compare) honor the per-model setting — same model in
either UI uses the same temperature.

### Backend wire

| Concern | File |
| --- | --- |
| YAML round-trip (load / save) | `backend/src/persistence/model_settings.rs` |
| In-memory state + `get_model_settings` + `set_model_temperature` + range validation | `backend/src/commands/model_settings.rs` |
| Inference request shape (`options.temperature`, nested per Ollama's API) | `backend/src/inference/ollama.rs` |
| Workspace lookup | `backend/src/commands/prompt.rs` (reads from `ModelSettingsState` before each call) |
| Compare lookup (per row) | `backend/src/commands/compare.rs` + `inference/compare_runner.rs::rows_for` |

Validation rejects `< 0`, `> 2`, `NaN`, and `±∞` with
`AppError::Validation`. The frontend never sends the temperature — the
backend looks it up from `ModelSettingsState` per call, which means
the IPC contract for `run_prompt` / `run_compare` stays unchanged.

### Frontend wire

| Concern | File |
| --- | --- |
| IPC wrapper + Zod schema | `frontend/src/shared/ipc/model_settings.ts` |
| Zustand store (loaded once at app start) | `frontend/src/features/models/state/modelSettingsStore.ts` |
| Gear + slider popover | `frontend/src/features/workspace/components/ModelTemperaturePopover.tsx` |
| Mount point | `frontend/src/features/workspace/components/ModelPicker.tsx` |
| App-start load | `frontend/src/App.tsx` calls `useModelSettingsStore.getState().load()` next to the existing installed-models bus |

### On-disk format

A YAML map at `<app_config_dir>/model_settings.yaml`. On macOS that's
`~/Library/Application Support/dev.quantamind.app/model_settings.yaml`.

```yaml
mistral:7b:
  temperature: 1.4
llama3.2:1b:
  temperature: 0.0
```

Missing file → empty map (every model uses 0.7). Empty file → same.
Unknown model → 0.7 at read time. Parent directories are created on
first write.

---

## 2. Ollama server controls (Start / Stop / Install)

### What the user sees

**When Ollama is unreachable**, the ModelPicker no longer shows the
old dead-end red "Ollama is not running" text. It renders an amber
empty-state card:

| State | UI |
| --- | --- |
| `idle` | Heading "Ollama is not running" + `[Start Ollama]` (primary blue) + `Install Ollama` (text link). |
| `starting` | Spinner + "Starting Ollama…". The button is disabled. Lasts up to 10s. |
| `success` | Brief "Ollama started ✓" for ~1s, then the picker re-renders into the model dropdown. |
| `error` | Red "Couldn't start Ollama" + the verbatim backend error + `[Retry]`. |
| `not_installed` | "Ollama is not installed on this machine" + `[Install Ollama]` that opens https://ollama.com/download in the system browser. |

**When Ollama is running**, the picker renders the dropdown + gear +
a small square Stop button (filled stop icon). Click → server is
killed, `ollamaHealthy` flips to false, the empty state re-appears
with its Start button. You never see both Start and Stop at once —
they're mutually exclusive on the current health state.

### Backend — start side (`start_ollama` command)

`backend/src/commands/ollama_start.rs::start_ollama` returns a
discriminated union:

```rust
#[serde(tag = "status", rename_all = "snake_case")]
pub enum OllamaStartResult {
    AlreadyRunning,
    Started { pid: u32 },
    NotInstalled { install_url: String },
    StartFailed { error: String },
}
```

Steps, in order:

1. **Fast-path probe.** GET `http://localhost:11434/api/tags` with a
   1s timeout. 200 → `AlreadyRunning`.
2. **Resolve binary.** `which ollama`, then `/opt/homebrew/bin/ollama`,
   then `/usr/local/bin/ollama`. None found → `NotInstalled` with the
   download URL.
3. **Spawn detached.** `Command::new(bin).arg("serve")` with
   stdin/stdout/stderr piped to `Stdio::null()` so the server outlives
   QuantaMind. Spawn failure → `StartFailed { error }`.
4. **Poll for readiness.** GET `/api/tags` every 500ms for 10s. First
   hit → `Started { pid }`. Timeout → `StartFailed` with a "didn't
   become reachable within 10 seconds" message.

Process-spawn helpers (path resolution, spawn, kill, probe, poll)
live in `backend/src/commands/ollama_runtime.rs` so `ollama_start.rs`
stays under the 100-line cap.

**Idempotency.** `OllamaStartState { in_progress: Mutex<bool> }` guards
against the user spamming Start: a second concurrent call returns
`AlreadyRunning` immediately and does not spawn a second process.

### Backend — stop side (`stop_ollama` command)

`stop_ollama` is a thin wrapper around `ollama_runtime::kill_serve()`,
which runs `pkill -f "ollama serve"`. The pattern matches the server
regardless of who launched it — the QuantaMind spawn, a manual
terminal `ollama serve`, or the Ollama Mac app all fall under the
same kill.

`pkill` exit code 1 ("no process matched") is treated as success —
the caller asked for Ollama to be stopped and it already is. Anything
catastrophic (binary missing, exec failure) bubbles up as
`AppError::Internal`.

The command does not block on the process actually exiting. The
frontend optimistically flips `ollamaHealthy = false` as soon as the
IPC resolves, which immediately re-renders the empty state. The
existing health-tick in `StatusBar` will reconcile the real state
within a second or two if the kill somehow didn't take.

### Frontend wire

| Concern | File |
| --- | --- |
| IPC wrappers (`startOllama`, `stopOllama`) + Zod schema for the start union | `frontend/src/shared/ipc/ollama_start.ts` |
| Start state machine (`idle → starting → success/error/not_installed`) | `frontend/src/features/workspace/hooks/useStartOllama.ts` |
| Stop state machine (`idle → stopping → idle/error`) | `frontend/src/features/workspace/hooks/useStopOllama.ts` |
| Five-state empty-state card | `frontend/src/features/workspace/components/OllamaEmptyState.tsx` |
| Render switch + Stop button host | `frontend/src/features/workspace/components/ModelPicker.tsx` |

The `start` success path waits 1s, then calls
`useWorkspaceStore.setOllamaHealthy(true)` and
`useInstalledModelsStore.refresh()`.

### Where Ollama actually runs

Same machine, same user, default port `11434`, same data dir
(`~/.ollama/` unless `OLLAMA_MODELS` is set) — nothing about clicking
Start changes Ollama's behavior versus typing `ollama serve` in a
terminal. The server is **detached**: stdin/stdout/stderr piped to
`/dev/null` and spawned as its own process, so quitting QuantaMind
does **not** kill Ollama. Only an explicit Stop click, a manual
`pkill ollama`, a machine restart, or a crash will stop it.

**Side effect of the `/dev/null` redirect: logs from a
QuantaMind-spawned server are discarded.** If you need to debug
Ollama itself, kill it (Stop button or `pkill ollama`) and run
`ollama serve` manually in a terminal — stderr streams to that
window. If you have the Ollama Mac app installed, its server writes
to `~/.ollama/logs/server.log`, but that file is silent when
QuantaMind is the one running the server. A future-phase fix is to
redirect stderr to a file under `<app_data_dir>` instead of null.

### Platform support

macOS only this release. On Windows/Linux, `resolve_ollama()` returns
`None` (forcing the `not_installed` UI) and `spawn_serve()` /
`kill_serve()` return the "not yet supported on this OS" error. The
gates are `#[cfg(target_os = "macos")]`, so cross-compiling still
builds cleanly.

### Sequential vs parallel memory profile (`keep_alive`)

Ollama keeps a model loaded in RAM for 5 minutes after a request
finishes by default. That's snappy for re-runs of the same model in
the Workspace, but it breaks the *intent* of Compare's sequential
strategy: when the second row's request arrives, Ollama loads the new
model **in addition** to the prior one, so for a few minutes both are
resident. On RAM-constrained machines that triggers swap thrash or
OOM with bigger models.

Fix: the backend now sends `keep_alive: 0` in the `/api/generate`
body for every sequential request (`Sequential` and
`SequentialSkippable` strategies). Ollama unloads the model the
instant the response stream ends, so the next row's model loads into
a freed-up cache. Parallel keeps `keep_alive` unset (the caller wants
all models loaded concurrently — that's the whole point). Workspace
single-model `run_prompt` also keeps it unset so back-to-back runs
of the same model stay snappy.

Verify with `watch -n 0.5 'ollama ps'` while a sequential compare is
in flight — only one row should show up at any moment, with the prior
row's model disappearing before the next row's appears.

### Model-loading indicator (UI)

Big models (14B+, multi-GB GGUFs) take 10–30s loading weights into
RAM before Ollama can stream the first token. Until the v0.1.0 fix,
that window showed empty UI and looked like a hang.

- **Compare:** the backend emits an `EVENT_COMPARE_LOADING` event for
  the active row immediately before the `stream_generate` call. The
  frontend (`compareEventBus`) flips that row into a new `"loading"`
  `RowStatus`. `CompareColumn` renders an inline spinner +
  "Loading model… large models can take 30+ seconds on first load."
  The existing token handler transitions `loading → running` on the
  first token.
- **Workspace:** no extra event needed — the status is already
  `"running"` before the first token arrives. `OutputStream` accepts
  an optional `loading` prop; `Workspace.tsx` passes
  `loading={status === "running" && !output}`. Same spinner +
  placeholder copy; swaps to streaming text on first token.

Spinner uses the existing Tailwind `animate-spin` pattern from
`OllamaEmptyState::Spinner`. No new icon dependency.

### Run-gate when Ollama is down

When `ollamaHealthy === false` (because the user clicked Stop or
because Ollama crashed), the model picker correctly swaps to the
empty state — but the Run button below was still clickable if a
model had been selected earlier and was still in the store. Clicking
it produced a back-end error rather than a clear "you need to start
Ollama" signal.

Fix: `RunControls` accepts an `ollamaHealthy` prop and short-circuits
`canRun` when it's not `true`. The Run button goes disabled and its
hover `title` is "Start Ollama first" — the user's eyes land on the
visible Start button in the empty state immediately above. When
`ollamaHealthy` flips back to `true`, Run re-enables automatically.

### Health-check timeout: 800ms → 2500ms

`backend/src/commands/health.rs::PROBE_TIMEOUT` was 800ms. When
Ollama was busy loading a big model, requests could exceed 800ms and
the StatusBar would false-negatively flip `ollamaHealthy` to `false`.
Every surface gated on that store value (Storage page, etc.) then
said "Ollama is not running" — a lie. Bumping the timeout to 2500ms
eliminates the false negative without slowing genuine-outage
detection: a real down server still fails fast via "Connection
refused," not via timeout.

### New dependency

`tauri-plugin-shell` (Rust + JS) was added solely for the Install
button. `backend/capabilities/default.json` grants `shell:allow-open`
scoped to **exactly two URLs** — see the next section.

---

## 3. `ollama.com/library` opens in the system browser

The Models → Ollama tab includes the copy:

> Type any Ollama model name (e.g. `mistral:7b`, `qwen2.5:14b`).
> Browse all available models at **ollama.com/library**.

The `ollama.com/library` text is now a real hyperlink (rendered as a
styled `<button>`) that calls `@tauri-apps/plugin-shell`'s `open()`,
which hands the URL to the OS default browser. Inside a Tauri webview
a plain `<a target="_blank">` either navigates the webview itself or
is silently dropped depending on the runtime — the shell plugin is the
canonical way to launch the system browser.

Implementation: `frontend/src/features/models/components/tabs/OllamaLibraryTab.tsx`.

`backend/capabilities/default.json` whitelists exactly two URLs under
`shell:allow-open`:

- `https://ollama.com/download` (the Install button)
- `https://ollama.com/library` (this hyperlink)

No blanket open permission. Adding any other URL requires an explicit
capability entry.

---

## 4. In-app feedback (button + modal → user's mail client)

### What the user sees

A small floating Feedback button bottom-right of every view (fixed
position, 60% opacity until hover, z-index 30 — sits above content but
below modals at z-40). Click → modal opens:

> **Send us feedback**
> QuantaMind is early. Honest feedback — what's broken, what's
> missing, what you wish worked differently — directly shapes what
> we build next.
> [textarea]
> ☐ Include diagnostic info (app version, OS, current model)
> Click **Open in mail app** and your default email client opens a
> draft to **info@quantamind.co** with this message pre-filled. You
> hit Send from there. We read every message.
> [Cancel]  [Open in mail app]

- **Open in mail app** is disabled until the trimmed message length
  is in `[10, 5000]`.
- **Esc** and clicking the backdrop close the modal (unless the
  mail-app launch is in flight).
- **Success** → modal closes, toast at the bottom of the screen:
  "Opened your mail app — review and hit Send."
- **Failure** (no default mail client, OS denied the launch, …) →
  inline red error under the form, modal stays open, retry by
  clicking the button again.

### Why mailto, not an HTTP relay

The earlier v0.1.0 plan posted to a Web3Forms relay with a
build-time access key. We replaced it with a `mailto:` flow because:

- **No third-party account or build-time secret.** The app needs no
  Web3Forms key, no env var at `cargo build` time, no rerun-if-
  env-changed hook in `build.rs`. The dev / release builds are
  identical.
- **The user sees what they're sending before it goes out.** Mail
  client opens, body pre-filled, user reviews, hits Send. No
  surprises about what we transmit.
- **From-address is automatic.** The user's mail client sends from
  their address, so reply-to "just works" — we no longer need the
  separate email input field that the old form had.
- **One less network path that can fail.** No outbound POST, no
  HTTP timeout, no third-party uptime. The only thing that can fail
  is "the OS can't find a default mail client," which surfaces
  cleanly via the shell.open rejection path.

### Diagnostics opt-in (what the checkbox actually does)

Unchecked (default): the email body is just the user's message.
Checked: the frontend appends a small block to the body:

```
[user message]

---
Diagnostics (opt-in)
App: QuantaMind v0.1.0
User-Agent: <navigator.userAgent>
Model: <currently selected model or "(none selected)">
```

The user can edit or delete it in their mail client before sending.
No logs, no IP, no identifying info beyond what the user typed plus
those three lines.

### How it's wired

| Concern | File |
| --- | --- |
| mailto: URL builder + constants | `frontend/src/shared/ipc/feedback.ts` |
| State machine (`idle → opening → success/error`) | `frontend/src/features/feedback/hooks/useSubmitFeedback.ts` |
| Floating button | `frontend/src/features/feedback/components/FeedbackButton.tsx` |
| Modal + form | `frontend/src/features/feedback/components/FeedbackModal.tsx` |
| Minimal toast primitive (`Toast`, `useToast`, `<ToastHost />`) | `frontend/src/shared/ui/Toast.tsx` |
| Mount point | `frontend/src/App.tsx` mounts both `<FeedbackButton />` and `<ToastHost />` at the root |
| Capability allowlist | `backend/capabilities/default.json` grants `shell:allow-open` with a `mailto:**` scope alongside the two `ollama.com` URLs |

There is **no backend command** for feedback. The mailto URL is
built entirely in the renderer and handed off via
`@tauri-apps/plugin-shell`'s `open()` — the same hand-off the
Install Ollama and `ollama.com/library` buttons use.

### Cross-cutting

`workspaceStore` gained `selectedModel` + `setSelectedModel` so the
diagnostics path has a single source of truth for the active model.
`Workspace.tsx` dropped its local `useState` in favor of the store —
no behavioral change, but the model is now readable from anywhere in
the tree (which the feedback modal needs).

---

## 5. Drive-by fixes (branding, gitignore)

Folded into the relevant feature commits because they were tiny and
in-scope for "branding correctness":

- `frontend/index.html` title: `Splice` → `QuantaMind`.
- `frontend/src/features/models/components/StoragePathSection.tsx`
  copy: `Quatamind` (missing `n`) → `QuantaMind`.
- `backend/src/commands/settings.rs` probe filenames:
  `.quatamind-write-probe` / `.quatamind-rename-probe` →
  `.quantamind-*`.
- `backend/src/commands/hf_install.rs` temp dir: `quatamind-hf` →
  `quantamind-hf`.
- `.gitignore` gained `splice-current.yaml` next to the existing
  `quantamind-current.yaml` entry (legacy per-user workspace dump
  files left over from before the rename); the stray Splice file
  was deleted from the working tree.
- **Workspace Save/Load YAML bar removed.** The half-finished
  `WorkspaceIO` panel that wrote `./quantamind-current.yaml` to an
  unpredictable relative path was deleted along with its backend
  `save_prompt` / `load_prompt` commands, the `persistence/prompts`
  module, the `StoredPrompt` type, and all related tests. The
  selected-model + prompt state already survives tab switches via
  `workspaceStore.selectedModel`, so within a session nothing's
  lost. A proper "Save prompt" with the native dialog and a sane
  default location (e.g. `~/Downloads`) is the right shape when
  someone actually asks for it via the feedback button.

---

## 6. Files added or modified

### New backend files

- `backend/src/persistence/model_settings.rs` — YAML round-trip
- `backend/src/commands/model_settings.rs` + `model_settings_tests.rs`
- `backend/src/commands/prompt_run.rs` — extracted `run_prompt_inner`
  + `validate` so `prompt.rs` could grow the temperature plumbing
  without busting the 100-line cap
- `backend/src/commands/ollama_start.rs` + `ollama_start_tests.rs`
- `backend/src/commands/ollama_runtime.rs` — process spawn / kill /
  probe / poll helpers

### New frontend files

- `frontend/src/shared/ipc/{model_settings,ollama_start,feedback}.ts`
- `frontend/src/shared/ui/Toast.tsx`
- `frontend/src/features/models/state/modelSettingsStore.ts`
- `frontend/src/features/workspace/components/{ModelTemperaturePopover,OllamaEmptyState}.tsx`
- `frontend/src/features/workspace/hooks/{useStartOllama,useStopOllama}.ts`
- `frontend/src/features/feedback/components/{FeedbackButton,FeedbackModal}.tsx`
- `frontend/src/features/feedback/hooks/useSubmitFeedback.ts`
- Tests: `ModelTemperaturePopover.test.tsx`, `ModelPicker.stop.test.tsx`,
  `OllamaEmptyState.test.tsx`, `FeedbackModal.test.tsx`,
  plus a new case added to `OllamaLibraryTab.test.tsx`.

### Modified

- `backend/Cargo.toml` (+`tauri-plugin-shell`)
- `backend/build.rs` (+`cargo:rerun-if-env-changed=WEB3FORMS_ACCESS_KEY`)
- `backend/capabilities/default.json` (+two `shell:allow-open` URLs)
- `backend/src/lib.rs` (registers shell plugin, manages new state,
  exposes new commands)
- `backend/src/commands/{mod,prompt,compare}.rs` and
  `backend/src/inference/{ollama,compare_runner}.rs` (temperature
  plumbing)
- `frontend/package.json` (+`@tauri-apps/plugin-shell`)
- `frontend/src/App.tsx` (loads model settings, mounts FeedbackButton
  + ToastHost)
- `frontend/src/features/workspace/state/workspaceStore.ts`
  (+`selectedModel`)
- `frontend/src/features/workspace/components/{Workspace,ModelPicker}.tsx`

### Test totals

- **Backend:** 67 lib tests pass (12 new — model_settings,
  ollama_start serialization, feedback validation + diagnostics).
- **Frontend:** 336 tests pass (21 new across the popover, the empty
  state, the stop button, the feedback modal, and the library
  hyperlink).
- One **pre-existing** test failure on this branch:
  `tests/install_local_gguf_verify.rs` references a privately-`use`'d
  function in `gguf_cmd.rs`. Not touched in this release; flagged in
  the Phase A commit body for a separate fix.

---

## 7. How to verify each feature

End-to-end smoke against `pnpm tauri dev`:

**Temperature.** Select a model, open the gear, drag the slider to
`0.05`, run a creative prompt twice — outputs should share a long
identical prefix and diverge only at near-tied tokens. Set to `1.8`,
run twice — outputs should be wildly different and looser. Quit the
app, reopen, open the popover — the value you set should still be
there (persisted to YAML). Confirm by `cat`-ing
`~/Library/Application Support/dev.quantamind.app/model_settings.yaml`.

**Ollama Start.** `pkill ollama` to stop the server. Open the app →
empty state appears with two buttons. Click `[Start Ollama]` → spinner
→ "Ollama started ✓" → model picker repopulates within ~2s. Click
Start twice in fast succession → only one `ollama serve` shows in
`ps aux | grep "ollama serve"`. Rename the ollama binary, click Start
→ `not_installed` state. Hold port 11434 with `nc -l 11434`, click
Start → `error` state with the verbatim error.

**Ollama Stop.** With Ollama running, find the Stop button next to the
gear, click it → the empty-state Start UI appears immediately;
`ps aux | grep "ollama serve"` shows no process.

**Install button.** From the `not_installed` state, click
`[Install Ollama]` → system browser opens to
https://ollama.com/download.

**Library hyperlink.** Models → Ollama tab → click the
`ollama.com/library` link in the description → system browser opens
to https://ollama.com/library.

**Feedback.** Click the bottom-right Feedback button → modal opens.
Try the 10-item checklist in your earlier spec: empty / short-message
rejection, invalid email, valid submit (toast + close), with email
(reply-to set in the email you receive), with diagnostics (version
+ OS + model in the email body), Cancel, Esc, reopen-shows-empty,
offline retry.

---

## 8. What is intentionally out of scope

These are the things you might expect this release to do that it
deliberately does not. None of them are blockers — each was scoped
out either to keep the release small or to preserve a behavior we
think the user wants.

- **Auto-start Ollama on app launch.** The user still clicks Start
  once if Ollama isn't running. Auto-start is a phase-2 polish.
- **Quit-time process management.** QuantaMind doesn't track or kill
  the spawned Ollama process at app exit. This is deliberate — an
  in-progress download or session survives a window close. Stop is a
  deliberate user action, not a side effect of quitting.
- **Installing Ollama for the user.** Security risk and platform
  complexity. Today the Install button just opens the official
  download page.
- **Windows / Linux server controls.** Start, Stop, and install
  detection are macOS-only. The non-mac arms compile but return
  "not yet supported on this OS."
- **Server log capture.** Logs from the QuantaMind-spawned `ollama
  serve` go to `/dev/null`. Documented workaround above; future fix
  is to redirect to a file under `<app_data_dir>`.
- **In-app feedback history.** The first 50 feedback emails belong in
  the founder's inbox, not a feature.
- **Screenshot attachment, categorization dropdown, sentiment rating,
  Discord/GitHub integration.** Each is a separate product; none was
  worth the day-1 weight.
- **`tauri-plugin-store`** for persistence. The existing
  `persistence/model_settings.rs` YAML pattern (`std::fs` +
  `serde_yaml`) was cheaper and avoids pulling a phase-2 dependency
  into this release.
- **Pre-existing `install_local_gguf_verify` test failure.** Out of
  scope — see test totals above.
