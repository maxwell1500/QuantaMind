# QuantaMind v0.1.0 — end-to-end feature overview

This document is the canonical reference for everything shipped on top
of the M-phase baseline in this release. Five user-facing features
plus a handful of drive-by hygiene fixes. Code paths and file names
are quoted so you can grep from here straight into the codebase.

> Length note: docs are exempt from the 100-line per-file cap that
> CLAUDE.md enforces on source. This doc is intentionally
> comprehensive — read top-to-bottom on a first visit, then use the
> table-of-contents to jump back to whatever you need.

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

## 4. In-app feedback (button + modal → Web3Forms)

### What the user sees

A small floating Feedback button bottom-right of every view (fixed
position, 60% opacity until hover, z-index 30 — sits above content but
below modals at z-40). Click → modal opens:

> **Send us feedback**
> QuantaMind is early. Honest feedback — what's broken, what's
> missing, what you wish worked differently — directly shapes what
> we build next.
> [textarea]
> Your email (optional — only if you want a reply)
> [email input]
> ☐ Include diagnostic info (app version, OS, current model)
> Feedback goes to info@quantamind.co. We read every message.
> [Cancel]  [Send]

- **Send** is disabled until the trimmed message length is in
  `[10, 5000]`.
- **Esc** and clicking the backdrop close the modal (unless a
  submission is in flight).
- **Success** → modal closes, toast at the bottom of the screen:
  "Thanks — we read every message."
- **Failure** → inline red error under the form, modal stays open,
  retry by clicking Send again.

### Diagnostics opt-in (what the checkbox actually does)

Unchecked (default): the email contains only the message and the
reply-to address. The `diagnostics` field on the payload is an empty
string and is stripped before send.

Checked: the backend builds a small three-line string:

```
app: QuantaMind v0.1.0
os: macos (aarch64)
model: <currently selected model>
```

— from `env!("CARGO_PKG_VERSION")`, `std::env::consts::{OS, ARCH}`,
and the frontend's currently-selected model (read from
`useWorkspaceStore.selectedModel`, which `Workspace.tsx` writes via
`setSelectedModel` whenever the picker changes). No logs, no IP, no
identifying info beyond what the user typed plus that string. The
checkbox is unchecked by default precisely so this is opt-in.

### Build-time access key

The Web3Forms access key is read at compile time via
`option_env!("WEB3FORMS_ACCESS_KEY")`. **Builds succeed without it,**
but `submit_feedback` returns a clear error if it wasn't set:

> internal: feedback is disabled in this build (`WEB3FORMS_ACCESS_KEY`
> was not set at compile time)

To enable feedback for a release build:

```sh
WEB3FORMS_ACCESS_KEY=<your-key> pnpm tauri build
```

`backend/build.rs` declares
`cargo:rerun-if-env-changed=WEB3FORMS_ACCESS_KEY` so the build
re-runs when you swap keys.

### Backend

`backend/src/commands/feedback.rs::submit_feedback`:

1. Trim message; validate length is in `[10, 5000]`, else
   `AppError::Validation`.
2. If `user_email` is set, validate with a small inline checker
   (single `@`, no whitespace, dotted domain, no leading/trailing
   dot in domain). Bad shape → `AppError::Validation`.
3. If `include_diagnostics`, build the three-line string above.
4. POST JSON to `https://api.web3forms.com/submit` via the existing
   `inference::http::probe_client` (so the same 30s timeout and
   QuantaMind User-Agent apply).
5. Non-2xx → `AppError::Inference` with the response body included so
   debugging isn't blind.

Payload shape Web3Forms receives:

```json
{
  "access_key": "<your key>",
  "subject":    "QuantaMind Feedback",
  "from_name":  "QuantaMind App",
  "message":    "<user text>",
  "reply_to":   "<user email or no-reply@quantamind.co>",
  "diagnostics": "app: QuantaMind v0.1.0\nos: macos (aarch64)\nmodel: mistral:7b"
}
```

Web3Forms takes that and emails it to the address registered at sign-up
(currently **info@quantamind.co**).

### Frontend wire

| Concern | File |
| --- | --- |
| IPC wrapper | `frontend/src/shared/ipc/feedback.ts` |
| State machine (`idle → submitting → success/error`) | `frontend/src/features/feedback/hooks/useSubmitFeedback.ts` |
| Floating button | `frontend/src/features/feedback/components/FeedbackButton.tsx` |
| Modal + form | `frontend/src/features/feedback/components/FeedbackModal.tsx` |
| Minimal toast primitive (`Toast`, `useToast`, `<ToastHost />`) | `frontend/src/shared/ui/Toast.tsx` |
| Mount point | `frontend/src/App.tsx` mounts both `<FeedbackButton />` and `<ToastHost />` at the root |

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
  `quantamind-current.yaml` entry, so the legacy per-user workspace
  state file (left over from before the rename) doesn't reappear in
  `git status` on machines that still have it lying around. The stray
  file itself was deleted from the working tree.

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
- `backend/src/commands/feedback.rs` + `feedback_tests.rs`

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
- **`tauri-plugin-store`** for persistence. Mirroring the existing
  YAML pattern in `persistence/prompts.rs` was cheaper and avoids
  pulling a phase-2 dependency into this release.
- **Pre-existing `install_local_gguf_verify` test failure.** Out of
  scope — see test totals above.
