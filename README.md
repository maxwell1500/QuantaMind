<div align="center">

# QuantaMind

**A native desktop workbench for running, comparing, and managing local large language models.**

Built with Tauri, Rust, React, and Ollama. Local-first. No telemetry. No cloud.

<sub>Workspace · Model Management · Compare · all in one ~30 MB binary</sub>

<br/>

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131?logo=tauri&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange?logo=rust&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active%20development-yellow)

</div>

---

## Table of contents

- [Overview](#overview)
- [Why QuantaMind](#why-quantamind)
- [Screenshots](#screenshots)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Building from source](#building-from-source)
- [Project layout](#project-layout)
- [Deep dive — Workspace](#deep-dive--workspace)
- [Deep dive — Model Management](#deep-dive--model-management)
- [Deep dive — Compare](#deep-dive--compare)
- [Install pipeline internals](#install-pipeline-internals)
- [Live model browsing](#live-model-browsing)
- [Engineering principles](#engineering-principles)
- [Development workflow](#development-workflow)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security & privacy](#security--privacy)
- [FAQ](#faq)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Overview

**QuantaMind** is a native desktop application that turns your computer into a serious workbench for local language models. Instead of juggling terminal commands, half-finished scripts, and three different chat UIs, QuantaMind gives you one focused window with three tools:

| Tool | What it does |
|---|---|
| **Workspace** | Write a prompt, pick a model, stream the answer back with timing metrics, save/load the prompt as YAML. |
| **Model Management** | Install, inspect, and uninstall models from three sources — Ollama library, Hugging Face GGUF, local files — without touching a terminal. |
| **Compare** | Run the same prompt through multiple models side-by-side, with a hardware feasibility check up front and Markdown/JSON export. |

Under the hood: a 30 MB Tauri binary — a native shell wrapped around a Rust backend and a React/TypeScript frontend, talking to a locally running Ollama server over HTTP.

> [!IMPORTANT]
> Everything runs on your machine. There is no QuantaMind cloud, no account, no telemetry. Your prompts and your model outputs never leave your hardware.

---

## Why QuantaMind

Anyone who has spent a weekend with local models knows the friction:

- You install Ollama, then realize you have to memorize CLI flags.
- You find a great GGUF on Hugging Face — but Ollama needs a Modelfile with the *right* chat template, and getting that wrong silently poisons every generation.
- You want to compare three models on the same prompt; now you're copy-pasting into three terminals and timing them with a stopwatch.
- You burn a 20 GB download halfway through and never notice the partial file lingering.

QuantaMind exists to remove that friction without hiding the underlying tools. It doesn't replace Ollama; it sits on top of it as a **well-engineered workspace** that makes the same primitives usable.

Three design commitments shape every decision:

1. **Local-first, always.** Your prompts, your models, your hardware, your data.
2. **Honest UX.** When the system can't guarantee something, the UI says so plainly instead of fabricating confidence.
3. **Engineering discipline.** Small files, separated concerns, strict data-quality gates after every change.

---

## Screenshots

> [!NOTE]
> Drop screenshots into `docs/img/` and link them here once the UI is final.

```
┌──────────────────────────────────────────────────────────┐
│  QuantaMind                                              │
├──────────────────────────────────────────────────────────┤
│  Model: [llama3.2:1b ▾]  [+]            Run · Cancel     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Why is the sky blue?                               │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ The sky appears blue because of Rayleigh           │  │
│  │ scattering...                                      │  │
│  └────────────────────────────────────────────────────┘  │
│  TTFT 8ms · 32.0 tok/s · 47 tokens                       │
├──────────────────────────────────────────────────────────┤
│  llama3.2:1b   ● connected · 0.1.32   TTFT 8ms · 32.0…   │
└──────────────────────────────────────────────────────────┘
```

---

## Features

### Workspace
- Monaco-based prompt editor (same editor that powers VS Code)
- Live model picker driven by `/api/tags` — what shows is what Ollama can actually serve right now
- Token-by-token streaming output in a preserved-whitespace pane
- Explicit `running` / `streaming` / `done` / `cancelled` / `error` terminal states
- Clean cancellation that cuts the HTTP stream — no fake "done" events
- Save and load prompts as YAML with byte-identical round-trip
- Per-run metrics: TTFT in ms, sustained tokens/sec, token count
- Persistent status bar: model name, Ollama health pill, latest run metrics

### Model Management
- One modal, three tabs: Ollama Library, Hugging Face, Local File
- Disk-space pre-check refuses any install that would leave < 2 GB free
- Real-time progress: bytes / total / speed (5-second moving average) / ETA
- Cancel button on every in-flight install
- Storage tab with size-sorted list, family, parameter count, quantization
- One-click Uninstall guarded by an `alertdialog` confirmation
- Storage path section that shows current `OLLAMA_MODELS` and *honestly* helps you change it

### Compare
- Top-level tab parallel to Workspace
- Multi-select installed models, one prompt, three strategies
- Hardware feasibility verdict: `ok` / `risky` / `wont_fit` — computed at click time
- Per-model streaming column with its own metrics row
- Export full run as Markdown or JSON via save dialog

---

## Tech stack

> [!NOTE]
> These choices are **locked**. Substitutions require explicit review.

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2.x** | ~30 MB binaries, native WebView, Rust backend |
| Backend language | **Rust 1.75+** (ed. 2021) | Tauri default; safe IPC + HTTP |
| Frontend framework | **React 18 + TypeScript 5** | Largest open-source contributor pool |
| Build tool | **Vite 5** | Fast HMR, Tauri-friendly |
| Styling | **Tailwind CSS 3** | Utility-first, no design-system overhead |
| State management | **Zustand** | ~1 KB, no boilerplate, scales |
| Editor | **`@monaco-editor/react`** | Same editor as VS Code |
| HTTP client (Rust) | **`reqwest` + `tokio`** | Battle-tested |
| Serialization | **`serde` + `serde_json` / `serde_yaml`** | Type-safe across IPC |
| Validation (TS) | **`zod`** | Runtime schema validation at IPC boundary |
| Validation (Rust) | **`validator` + `serde`** | Type-level + custom validators |
| Testing (Rust) | **`cargo test` + `mockito`** | Built-in, no setup |
| Testing (TS) | **`vitest` + `@testing-library/react`** | Fast, Vite-native |
| Format / Lint | **`rustfmt` + Prettier / Clippy + ESLint** | Auto-format on save |
| Pre-commit | **`lefthook`** | Lighter than Husky |
| CI | **GitHub Actions** | Free for open source |

<details>
<summary><b>What is deliberately NOT installed (yet)</b></summary>

- No logging library — `println!` / `console.log` until persistence arrives in Phase 2
- No state-machine library — Zustand is enough
- No UI component library — Tailwind utilities only
- No form library — there are no real forms yet
- No in-process AI/ML libraries — QuantaMind *calls* Ollama; it doesn't run inference itself

Every dependency is a maintenance debt. Resist additions.

</details>

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                  QuantaMind Desktop App                    │
│                                                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │            React + TypeScript Frontend             │    │
│  │   features/  ←  shared/ipc/  ←  Tauri invoke()     │    │
│  └──────────────────────────┬─────────────────────────┘    │
│                             │                              │
│                    IPC boundary (JSON)                     │
│                             │                              │
│  ┌──────────────────────────▼─────────────────────────┐    │
│  │               Rust Backend (backend/)              │    │
│  │   commands/  →  inference/  →  metrics/            │    │
│  │        ↓                                           │    │
│  │   persistence/                                     │    │
│  └──────────────────────────┬─────────────────────────┘    │
└─────────────────────────────┼──────────────────────────────┘
                              │ HTTP
                              ▼
                ┌─────────────────────────────┐
                │   Ollama (localhost:11434)  │
                └─────────────────────────────┘
```

**Module boundaries**

| Side | Module | Responsibility |
|---|---|---|
| Frontend | `app/` | App shell, routing, providers. No feature logic. |
| Frontend | `features/<name>/` | Vertical slice: components, hooks, state, types, tests. Deletable in one `rm -rf`. |
| Frontend | `shared/ipc/` | **Only** place that calls Tauri `invoke`. Typed wrappers + zod schemas. |
| Frontend | `shared/components/` | Primitives reused by 2+ features. |
| Backend | `commands/` | IPC entry points. Thin: validate, call domain, return. |
| Backend | `inference/` | Backend adapters behind `InferenceBackend` trait (Ollama today). |
| Backend | `metrics/` | TTFT, tokens/sec, VRAM (Phase 4). |
| Backend | `persistence/` | YAML/JSON read+write for prompts and history. |
| Backend | `validation/` | Schemas shared by commands and persistence. |
| Backend | `errors.rs` | Single `AppError` enum. **No `unwrap()` outside tests.** |

The two halves talk JSON over Tauri's IPC. Contracts are explicit in `shared/ipc/types.ts` on the TS side, mirrored in Rust — no codegen.

---

## Quick start

### Prerequisites

| Tool | Version |
|---|---|
| **Rust** | 1.75+ |
| **Node** | 20+ |
| **pnpm** | 9+ |
| **Ollama** | latest |

### Install

> [!TIP]
> Replace `<repo-url>` with your fork or this repo's URL.

```bash
# 1) Toolchains (macOS shown; adapt for Linux/Windows)
brew install rust node pnpm ollama
xcode-select --install   # macOS only

# 2) Start Ollama + pull a small model
ollama serve &
ollama pull llama3.2:1b
curl http://localhost:11434/api/tags   # smoke-test that Ollama is up

# 3) Clone and install
git clone <repo-url> quantamind
cd quantamind/frontend
pnpm install

# 4) Run in dev mode
pnpm tauri dev
```

The first run opens a native window. Editing `frontend/src/App.tsx` and saving triggers HMR.

### First prompt
1. Pick a model from the dropdown.
2. Type a prompt (`Why is the sky blue?` is a good smoke test).
3. Click **Run**.
4. Watch tokens stream in. Note the metrics line below the output.

### First install from the UI
1. Click the **+** next to the Model Picker to open the **Add Model** modal.
2. Pick a tab:
   - **Ollama Library** — type any model name (e.g. `mistral:7b`) and click Install.
   - **Hugging Face** — search a GGUF repo, click a result, pick a variant.
   - **Local File** — drag a `.gguf` onto the modal or click Browse.
3. Confirm any disk-space warnings, click Install, watch the progress bar.

---

## Building from source

### Development build
```bash
cd frontend
pnpm install
pnpm tauri dev
```

### Production build
```bash
cd frontend
pnpm install
pnpm tauri build
```

Outputs land in `backend/target/release/bundle/`:
- macOS: `.dmg` and `.app`
- Windows: `.msi` and `.exe`
- Linux: `.deb`, `.rpm`, `.AppImage`

### Run the test suites

```bash
# Frontend tests (vitest)
cd frontend
pnpm test

# Backend tests (cargo test + mockito)
cd backend
cargo test
```

---

## Project layout

```
QuantaMind/
├── .github/
│   └── workflows/{ci.yml,release.yml,nightly.yml}
│
├── frontend/                       # React + TS + Vite
│   ├── src/
│   │   ├── app/                    # Shell, routing, providers
│   │   ├── features/
│   │   │   ├── workspace/          # Prompt + run + stream + YAML I/O
│   │   │   ├── models/             # Install / browse / storage
│   │   │   └── compare/            # Multi-model side-by-side
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   ├── ipc/                # ONLY place that calls invoke()
│   │   │   ├── format/
│   │   │   └── styles/tokens.css
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── tailwind.config.js
│
├── backend/                        # Rust + Tauri 2
│   ├── src/
│   │   ├── main.rs / lib.rs
│   │   ├── commands/               # IPC entry points
│   │   ├── inference/              # Ollama, HF, GGUF, chat-templates
│   │   ├── metrics/                # TTFT, tokens/sec
│   │   ├── persistence/            # YAML/JSON
│   │   ├── validation/             # Shared schemas
│   │   ├── sync.rs                 # Mutex poison recovery
│   │   └── errors.rs               # AppError enum
│   ├── tests/                      # Integration tests (cargo convention)
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── docs/                           # Architecture + workflow docs
├── CLAUDE.md                       # Project instructions
├── README.md                       # ← you are here
└── LICENSE
```

> [!NOTE]
> **Every source file is < 100 lines.** Hard limit. Splits are by concern, not by line count. See [Engineering principles](#engineering-principles).

---

## Deep dive — Workspace

### The flow
1. Open QuantaMind. The Model Picker fetches `/api/tags` from your local Ollama.
2. Type or paste a prompt into the Monaco editor.
3. Click **Run**.
4. Tokens stream into the output pane in real time.
5. The run terminates with one of:
   - **Done** — full metrics shown (TTFT, tok/s, token count)
   - **Cancelled** — distinct amber state, token count only
   - **Error** — typed error surfaced as a banner
6. Optionally save the prompt to a YAML file for reuse.

### State separation rule
A codified rule across the codebase:

> **Hooks own ephemeral per-action state; the store owns shared cross-component state.** Hooks may write to the store at completion. Components must not read both for the same data — pick one source.

In practice: the currently-streaming output and run status live in `useStreamingRun`'s local `useState`. The most-recent run's final metrics are written into the Zustand `useWorkspaceStore` so the StatusBar (a separate part of the tree) can render them without prop-drilling.

### YAML round-trip
`StoredPrompt { model, prompt }` serializes with `serde_yaml` to a two-field document. Loading produces the same struct; saving it back produces a **byte-identical** file. The round-trip is asserted in the test suite for ASCII, multi-line (block scalar form `|-`), and UTF-8-with-embedded-quotes payloads.

### Cancellation
A `tokio_util::sync::CancellationToken` threads through the entire HTTP stream:
- An outer `tokio::select!` races the token against the next byte chunk
- An inner per-token check breaks the line-parse loop early
- The backend emits a dedicated `prompt-cancelled` event (**not** `prompt-done`) so the UI can render a distinct terminal state

### Timeouts
Every cross-process call has a budget:

| Call | Timeout |
|---|---|
| `run_prompt` | 30 s outer + 60 s reqwest connect; no per-request timeout on the stream |
| `stop_prompt` | 5 s |
| `list_models` | 5 s |

Timeouts surface as `AppError::Timeout` with a human-readable label.

---

## Deep dive — Model Management

The largest piece of code in the app, because installing models cleanly is *hard*.

### Three sources

<details open>
<summary><b>Ollama Library</b> — free-text input + Install</summary>

Type any model name Ollama knows (`mistral:7b`, `qwen2.5:14b`, …) and the backend's `pull_model` command POSTs `/api/pull` with `stream: true`, parses NDJSON line-buffered, and emits per-chunk progress events.

A live `list_models` subscription marks the typed name **Installed ✓** the moment it appears.

</details>

<details>
<summary><b>Hugging Face</b> — search the live HF API</summary>

```
GET https://huggingface.co/api/models
  ?search=<q>&library=gguf&sort=downloads&direction=-1&limit=30
```

Clicking a result opens a detail view that lists every `.gguf` file in the repo via `GET /api/models/{repo}/tree/main?recursive=true`. The quantization label is parsed from the filename (`Q4_K_M`, `IQ4_XS`, `BF16`, …); the install name is derived as `<basename>:<quant>` to satisfy Ollama's name validator.

Downloads stream to a `.partial` file with HTTP `Range` header support — interrupted installs **resume** on the next click.

</details>

<details>
<summary><b>Local file</b> — drag-and-drop or Browse</summary>

QuantaMind reads the first 64 KB of the `.gguf` file with a pure-Rust GGUF v3 header parser to extract:

- architecture (`llama`, `qwen2`, `phi3`, …)
- parameter count
- context length
- quantization (from `general.file_type`, with filename fallback)
- family (derived from architecture)

The user reviews metadata, picks a name (validated by regex + against existing models), clicks Import.

</details>

### What "Import" does

For both HF and Local sources, the keystone pipeline:

```
inspect_gguf(path)              → GgufMetadata
  ↓
detect_template(name, arch)     → Option<ChatTemplate>
  ↓
generate_modelfile(spec)        → Modelfile string
  ↓
ollama_create(name, modelfile)  → POST /api/create (NDJSON stream)
  ↓
verify_model_registered(name)   → backoff poll of /api/tags
  ↓
emit("models-changed")          → refresh installed list everywhere
```

The **chat template registry** covers 8 families today: Llama 3, Qwen/ChatML, Mistral, Phi-3, Gemma, Command-R, DeepSeek, Yi. Architecture is checked first (more reliable than name); name substring is a fallback. Unknown families return `None` so the UI surfaces a warning rather than emitting a wrong-template Modelfile.

### Disk pre-check

Before any install path downloads:

```
free = current free disk space at $OLLAMA_MODELS
need = estimated_size_bytes × 1.05   # 5 % safety margin

if free < 2 GB  after install → BlockedInsufficientSpace
if free < 10 GB after install → Warning
else                          → Ok
```

Constants are justified in code: 2 GB covers OS swap and app caches; 10 GB covers a week of the user's other work.

### Storage view

Sorted by size descending. Each row: family · parameter size · quantization · size. Uninstall opens an `alertdialog` that names the model and the bytes it frees. Only the Remove button (red) calls `DELETE /api/delete`. On success the backend emits `models-changed` and every consumer in the app re-fetches once.

---

## Deep dive — Compare

### Strategy choice

All three strategies are always visible so users can compare verdicts before picking. The Run button re-validates at click time and refuses to run a `wont_fit` strategy.

| Strategy | Memory needed | Wall-clock today | Why it exists |
|---|---|---|---|
| **Sequential** | `max(model_size)` | `N × per-model latency` | Safest default |
| **Parallel** | `sum(model_size)` | ≈ sequential (Ollama serializes) | Honest about issue time; ready for a second backend |
| **Sequential w/ skip** | `max(model_size)` | ≤ sequential | Bail out when you've seen enough |

### Feasibility math

```
required(model)        = ceil(size_bytes × 1.3)   # runtime > on-disk
sequential / skippable = max(required)
parallel               = sum(required)

verdict = need > avail        ? "wont_fit"
        : need > avail × 0.7  ? "risky"
                              : "ok"
```

`avail` comes from `sysinfo::System` available memory. On Apple Silicon it's labelled "Unified memory"; no discrete-VRAM probe yet.

### Event bus

Backend emits five `compare-*` events, each payload carries a per-row `model_id` (UUID generated at invoke time):

| Event | Payload |
|---|---|
| `compare-token` | `{ model_id, model, text }` per chunk |
| `compare-done` | `{ model_id, model, ttft_ms, tokens_per_sec, token_count }` |
| `compare-cancelled` | `{ model_id, model, token_count }` |
| `compare-error` | `{ model_id, model, kind, message }` |
| `compare-run-done` | Terminator; flips pending rows to `cancelled` |

### Export

`buildReport(...)` snapshots the store at click time. `toMarkdown(report)` and `toJson(report)` are pure functions of that value — streaming after Export doesn't mutate what was saved. The user picks a destination via `plugin-dialog::save`; the backend writes the file.

---

## Install pipeline internals

The install path has a shared invariant:

> [!IMPORTANT]
> **A successful install must be observable in the UI before the install hook returns "success".**

Getting there required hardening against several known Ollama 0.24+ behaviors.

### The `/api/tags` lag race
Ollama streams `{"status":"success"}` from `/api/create` *before* the new model is reflected in `/api/tags`. Observed lag: **50–800 ms**. A naive one-shot check races and reports a false "silently rolled back" error.

`verify_model_registered` solves this with a backoff ladder (50 / 100 / 200 / 400 / 800 / 1500 ms) plus a final confirmation read. Only after **all seven checks miss** does it declare a rollback.

### The un-terminated final-line problem
Ollama 0.24+ has been observed to close the HTTP connection with the final `{"status":"success"}` un-flushed and *un-terminated by a newline*. A line-based NDJSON parser drops that chunk and concludes the stream failed.

`backend/src/inference/ndjson.rs` flushes the un-terminated remainder via `ndjson::tail(&buf)` after stream close and re-runs the same chunk parser. Five integration tests cover the with-newline and without-newline success paths.

### Terminal states stay visible
The "In progress" list previously filtered to `["downloading", "installing"]` only, so entries vanished the instant status flipped to `success` or `error`. The list now retains terminal entries with badges and a Dismiss button. Success entries auto-clear after 5 s; error entries persist until dismissed.

### Self-healing refresh
`installedModelsStore` is the single source of truth for the installed list. A `models-changed` event bus mirrors `downloadEventBus`: one shared `listen("models-changed")` subscription mounted once in `App.tsx`, dispatching into the store. All five consumers subscribe to the store and fall back to calling `refresh()` themselves when status is `idle` — a self-heal that survives Tauri listener-registration races.

`remove_model` emits the same `models-changed` event, symmetric with install paths.

---

## Live model browsing

QuantaMind originally shipped bundled JSON catalogs of "popular" models. Those went stale fast. The current build replaces them with **live API queries**.

| Surface | Source | Fallback |
|---|---|---|
| Hugging Face search | `GET /api/models?library=gguf&...` | Inline error + Retry button |
| HF repo detail | `GET /api/models/{repo}/tree/main?recursive=true` | Inline error + Retry button |
| Ollama Library | Free-text input + live `list_models` subscription | Ollama's own error (404 → "not found") |

All backend HTTP clients set `User-Agent: quantamind/<version>`. HF behind Cloudflare can 400 on an empty UA; this prevents that.

---

## Engineering principles

> [!WARNING]
> These rules are non-negotiable. They're enforced in `CLAUDE.md` and applied to every change before it lands.

1. **One step at a time.** Don't start step N+1 until step N is implemented, its test passes, *and* its output is verified.
2. **Test pass ≠ data quality pass.** A green test proves the code ran the path you asked it to. The *output* must also match expected shape and values.
3. **Every file < 100 lines.** Hard limit. Source, tests, configs, docs. Splits are by concern, not line count.
4. **Separation of concerns.** Each file does one thing. No `utils.ts`, `helpers/`, `common/`, or `misc/`.
5. **Documentation ships with the change.** Same commit.
6. **Locked tech stack.** Substitutions require explicit review.

### The data-quality gate

After every green test, run through this checklist:

| Check | Looking for |
|---|---|
| **Shape** | Correct types, required fields present, no surprise fields; for streams: chunk count, ordering, terminator |
| **Values** | Within reasonable ranges; correct units (ms vs s, bytes vs MB); correct encoding (UTF-8, no BOM) |
| **Edge cases** | Empty input → empty output (not crash); large input handled or rejected; Unicode/emoji/RTL preserved; malformed input → typed error, not panic |
| **Cross-boundary fidelity** | Rust → JSON → TS field round-trip (snake_case vs camelCase!); disk → memory YAML byte-identical |
| **Determinism** | Same input → same output where applicable |

If verification fails, **fix the code, not the assertion**.

---

## Development workflow

The mandatory loop:

```
[1] Understand the step
[2] Implement the minimum
[3] Write the test
[4] Run the test
[5] Verify the output (data-quality gate)
[6] Update docs
[7] Commit (Conventional Commits)
[8] Move on
```

### Common violations (don't do)
- **Stacking steps** — "Let me knock out 1–3 then test." No.
- **Loosening assertions** — If `assert eq 42` fails because output is 41, fix the code.
- **Skipping verification because the test passed** — tests verify the path you wrote; verification confirms the path was right.
- **Bundling docs into "I'll update them later"** — later does not exist.
- **Refactoring during a feature** — open a separate branch.

### Naming conventions

| Domain | Style | Example |
|---|---|---|
| Rust functions / vars | `snake_case` | `run_prompt` |
| Rust types | `PascalCase` | `InferenceBackend` |
| Rust constants | `SCREAMING_SNAKE` | `DEFAULT_TIMEOUT_MS` |
| TS functions / vars | `camelCase` | `runPrompt` |
| TS components / types | `PascalCase` | `PromptEditor` |
| React component file | `PascalCase.tsx` | `PromptEditor.tsx` |
| TS non-component file | `kebab-case.ts` | `use-streaming-run.ts` |
| Rust file | `snake_case.rs` | `ollama.rs` |
| Git branch | `phase-N/feature-name` | `phase-1/streaming-output` |

### Commits — Conventional Commits

| Prefix | Use for |
|---|---|
| `feat:` | New user-visible behavior |
| `fix:` | Bug fix |
| `chore:` | Tooling, deps, config |
| `docs:` | Documentation only |
| `test:` | Adding or fixing tests |
| `refactor:` | No behavior change |

One step = one commit (or a tight related series). PR title matches the convention. PR body references `closes #N` when applicable.

### Errors
- **Rust:** `Result<T, AppError>` only. **No `unwrap()` outside tests.** Enforced by Clippy `deny(unwrap_used)` in critical files.
- **TypeScript:** discriminated unions returned across IPC. No thrown errors over the IPC boundary.

---

## Testing

### Frontend (vitest + Testing Library)
```bash
cd frontend
pnpm test            # run once
pnpm test --watch    # watch mode
```

Tests live next to code in `__tests__/` directories. Naming: tests are named after the behavior, not the function — `streams_tokens_in_order` not `test_run_prompt`. One behavior per test.

### Backend (cargo + mockito)
```bash
cd backend
cargo test           # unit + integration
cargo clippy --tests # lint
cargo fmt --check    # format
```

Inline `#[cfg(test)]` for unit tests; `backend/tests/` for integration (cargo convention). Mockito serves fixture responses for HTTP-dependent code paths.

### What we test
- **Stream ordering** — tokens arrive in correct order, byte-exact concat matches fixture
- **Cancellation** — no orphan tokens after cancel; HTTP connection closes
- **YAML round-trip** — save → load → save produces byte-identical files
- **IPC validation** — malformed payloads rejected with typed errors, no `NaN`/`undefined` reaching UI
- **Mutex poison recovery** — panic mid-lock doesn't crash; metrics degrade gracefully
- **Timeout enforcement** — `run_prompt` rejects with `AppError::Timeout` after 30 s
- **GGUF parsing** — architecture, param count, quant extracted correctly from real header bytes
- **Chat template detection** — 20+ real-world model names map to correct families

---

## Roadmap

QuantaMind ships in numbered phases. Once a phase ships, its exit criteria are frozen.

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Workspace MVP — prompt editor, streaming, YAML save/load | ✅ Shipped v0.1 |
| **Phase 1.5** | Stabilization — emit failure recovery, distinct cancel state, mutex poison recovery, Zod at IPC, timeouts | ✅ Shipped v0.1.1 |
| **Phase M** | Model Management — install/remove/inspect from 3 sources, GGUF parsing, chat templates, Modelfile generation | ✅ Shipped |
| **Phase M.5** | Live HF/Ollama browsing + Compare tab with hardware feasibility | 🚧 In progress |
| **Phase 2** | Settings + Persistence — `plugin-store`, `plugin-fs`, run history | 📋 Planned |
| **Phase 3** | Bench — second inference backend (`llama_cpp`) so Parallel beats Sequential in wall-clock | 📋 Planned |
| **Phase 4** | Inspector — live VRAM, latency breakdown, token-by-token timing, CSV export | 📋 Planned |
| **Phase 5** | MLX backend — native Apple Silicon inference path | 📋 Planned |

---

## Contributing

Contributions welcome. Before you open a PR:

1. **Read [`CLAUDE.md`](./CLAUDE.md)** — the engineering principles are non-negotiable.
2. **Read [`docs/workflow.md`](./docs/workflow.md)** — the one-step-at-a-time loop.
3. **Read [`docs/conventions.md`](./docs/conventions.md)** — naming, commits, branches.
4. **Stay under 100 lines per file.** No exceptions for source/test/config.
5. **Tests pass AND outputs are verified.** A green CI run is necessary, not sufficient.

### Branch naming
`phase-N/feature-name` — e.g. `phase-2/persistent-settings`.

### Pull request checklist
- [ ] Single concern (one feature, one bug, one refactor)
- [ ] Tests added/updated and passing
- [ ] Output verified — actually look at what the code produced
- [ ] Docs in `docs/` updated in the same PR
- [ ] No files exceed 100 lines
- [ ] No `unwrap()` outside tests
- [ ] Commit messages follow Conventional Commits

---

## Security & privacy

> [!IMPORTANT]
> QuantaMind is local-first by design.

| Guarantee | How it's enforced |
|---|---|
| **No telemetry** | No analytics SDK; no crash reporting service; no tracking pixels |
| **No account required** | App runs offline once a model is installed |
| **Network calls limited to** | `http://localhost:11434` (Ollama) and `https://huggingface.co` (only when you actively browse/install) |
| **No silent shell edits** | Changing `OLLAMA_MODELS` *generates* the export command for you; never edits your shell profile |
| **Tauri sandboxing** | Capabilities declared in `backend/capabilities/`; webview can only call IPC commands explicitly registered |
| **Schema validation at every IPC boundary** | Zod on TS side, serde + `validator` on Rust side; malformed payloads rejected with typed errors |
| **No `unwrap()` in production paths** | Clippy `deny(unwrap_used)` enforced in critical files; mutex-poison paths recover instead of panicking |

### Reporting vulnerabilities
Please open a private security advisory on the GitHub repo instead of filing a public issue.

---

## FAQ

<details>
<summary><b>Is QuantaMind a chat app?</b></summary>

No. QuantaMind is a workbench. Each run is a single prompt → single completion. If you want chat UI on top of Ollama, look elsewhere — though Phase 2 will add run history.

</details>

<details>
<summary><b>Does QuantaMind fine-tune or train models?</b></summary>

No. QuantaMind consumes pre-trained models. Training is out of scope.

</details>

<details>
<summary><b>Why Ollama and not llama.cpp directly?</b></summary>

Ollama gives us a clean HTTP API, a stable model storage convention, and handles a lot of platform-specific GPU plumbing. A direct `llama_cpp` adapter is planned for Phase 3 and an MLX adapter for Phase 5, so the inference layer is already structured behind an `InferenceBackend` trait.

</details>

<details>
<summary><b>Why are files capped at 100 lines?</b></summary>

Long files hide their dependencies, smuggle in second concerns, and make every reviewer scroll. The cap is a forcing function for separation of concerns.

</details>

<details>
<summary><b>Can I run QuantaMind without an internet connection?</b></summary>

Yes, once you've installed at least one model. The Workspace and Compare tabs are fully offline. The Hugging Face tab obviously needs connectivity.

</details>

<details>
<summary><b>What happens to my prompts?</b></summary>

They live in memory until you save them. Save creates a YAML file at the path you choose. No cloud sync. No backup. You own them.

</details>

<details>
<summary><b>How do I uninstall a model?</b></summary>

Open the Add Model modal → Storage tab → Uninstall on the row → confirm. The model is removed from Ollama and every list in the app refreshes.

</details>

<details>
<summary><b>Does QuantaMind send any usage data?</b></summary>

None. The only outbound HTTP is to your local Ollama and (when you ask) to Hugging Face.

</details>

---

## License

MIT — see [`LICENSE`](./LICENSE).

---

## Acknowledgements

QuantaMind stands on the shoulders of:

- **[Tauri](https://tauri.app/)** — the desktop shell
- **[Ollama](https://ollama.com/)** — the local model runtime
- **[Hugging Face](https://huggingface.co/)** — the GGUF ecosystem
- **[llama.cpp](https://github.com/ggerganov/llama.cpp)** — the GGUF format and inference primitives
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** — the prompt editor
- **[Zustand](https://github.com/pmndrs/zustand)**, **[Zod](https://zod.dev/)**, **[Vite](https://vitejs.dev/)**, **[React](https://react.dev/)**, **[Tailwind CSS](https://tailwindcss.com/)** — the frontend stack
- **[reqwest](https://github.com/seanmonstar/reqwest)**, **[tokio](https://tokio.rs/)**, **[serde](https://serde.rs/)** — the backend stack
- The open-weights model communities — Meta, Mistral, Qwen, Microsoft, Google, DeepSeek, and many others

---

<div align="center">

**Built with discipline. Local-first by design.**

<sub>Made by QuantaMind</sub>

</div>
