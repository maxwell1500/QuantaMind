# Working on QuantaMind

The locked tech stack, day-zero setup, conventions, the mandatory per-step
workflow, the data-quality gate, the phase roadmap, and deferred ideas.
Companion docs: `architecture.md` and `reference.md`.

## Tech stack

Locked decisions. Do not substitute. Alternatives go to
[Future considerations](#future-considerations).

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | Tauri 2.x | 30MB binary, native WebView, Rust backend |
| Backend language | Rust (stable, ed. 2021) | Tauri default, safe IPC + HTTP |
| Frontend framework | React 18 + TS 5.x | Largest open-source contributor pool |
| Build tool | Vite 5.x | Fast HMR, Tauri-friendly |
| Styling | Tailwind CSS 3.x | Utility-first, no design-system overhead |
| State management | Zustand | 1KB, no boilerplate, scales |
| Editor component | `@monaco-editor/react` | Same editor as VS Code |
| HTTP client (Rust) | `reqwest` + `tokio` | Standard, battle-tested |
| Serialization | `serde` + `serde_json` / native JSON | Type-safe across IPC |
| Validation (TS) | `zod` | Runtime schema validation |
| Validation (Rust) | `validator` + `serde` | Type-level + custom validators |
| Testing (Rust) | `cargo test` + `mockito` | Built-in, no setup |
| Testing (TS) | `vitest` + `@testing-library/react` | Fast, Vite-native |
| E2E | Playwright | Cross-platform |
| CI | GitHub Actions | Free for open source |
| Format | `rustfmt` + Prettier | Auto-format on save |
| Lint | Clippy + ESLint | Catch problems pre-runtime |
| Pre-commit | lefthook | Lighter than Husky |

Phase 3 additions (locked; installed when their step lands):

| Layer | Choice | Why |
|---|---|---|
| Word diff (TS) | `diff-match-patch` | De-facto standard for word-level diffs; tiny, dependency-free. |
| Secret storage (Rust) | `keyring` | OS-native keychain for cloud API keys — never plaintext on disk. |
| llama.cpp backend | `llama-server` (Tauri sidecar binary) | Local GGUF inference over HTTP, mirroring the Ollama path. Subprocess, not in-process FFI. |

Phase 4 additions (locked; installed when their step lands):

| Layer | Choice | Why |
|---|---|---|
| Charting (TS) | `visx` v4 (`@next`, scale/shape/group) | React-19-native (stable v3 pins React ≤18). Modular SVG primitives for the Inspector charts; we draw axes/legends ourselves. Pin the alpha until v4 ships stable. |

### What is explicitly NOT installed (yet)

- Logging library — use `println!` / `console.log` until Phase 2.
- State-machine library — Zustand is enough.
- UI component library — Tailwind utility classes only.
- Form library — no forms in Phase 1.
- AI/ML libraries — we do not run models in-process. We call Ollama, and a
  bundled `llama-server` sidecar over HTTP — never FFI.

Resist additions. Every dependency is a maintenance debt. Update this section
only when a locked choice is replaced (requires a PR with rationale) or a new
layer is added.

---

## Setup

Run these in order. Each is a checkpoint — do not paste them all at once.
macOS shown; adapt for Linux/Windows.

```sh
# 1. Prerequisites
brew install rust node pnpm
rustc --version    # 1.75+
node --version     # 20+
pnpm --version     # 9+
xcode-select --install

# 2. Create the project
pnpm create tauri-app@latest
# Project name: quantamind · Identifier: dev.quantamind.app
# Frontend: TypeScript · Package manager: pnpm · UI template: React (TS)
cd quantamind

# 3. Install frontend dependencies
pnpm add zustand zod @monaco-editor/react react-router-dom
pnpm add -D tailwindcss@3 postcss autoprefixer \
  vitest @testing-library/react @testing-library/jest-dom \
  @types/react jsdom
# (Rust deps are added in Phase 1, step 1.)

# 4. Initialize Tailwind
pnpm exec tailwindcss init -p
# tailwind.config.js content: ['./index.html','./src/**/*.{js,ts,jsx,tsx}']
# src/index.css: @tailwind base; @tailwind components; @tailwind utilities;

# 5. Git + pre-commit hooks
git init
git add . && git commit -m "chore: initial Tauri + React + TS scaffold"
pnpm add -D lefthook
pnpm exec lefthook install
# Create lefthook.yml (see CONTRIBUTING.md for content).

# 6. GitHub repo
gh repo create quantamind-dev/quantamind --public --source=. --remote=origin --push
gh repo edit --enable-discussions
# Set up branch protection on main (require PRs).

# 7. Verify the dev loop
pnpm tauri dev
# Edit src/App.tsx, save, see the window reload. If yes → ready.

# 8. Pull Ollama models
brew install ollama
ollama serve &
ollama pull llama3.2:1b       # dev workhorse, ~700MB
ollama pull phi3.5:latest     # variety for later phases
curl http://localhost:11434/api/tags
```

All 8 steps green → development environment ready. Day 1 starts with Phase 1
(see [Phase roadmap](#phase-roadmap)).

---

## Conventions

### Naming

| Domain | Style | Example |
|---|---|---|
| Rust functions / vars | `snake_case` | `run_prompt` |
| Rust types | `PascalCase` | `InferenceBackend` |
| Rust constants | `SCREAMING_SNAKE` | `DEFAULT_TIMEOUT_MS` |
| TS functions / vars | `camelCase` | `runPrompt` |
| TS components / types | `PascalCase` | `PromptEditor` |
| TS constants | `SCREAMING_SNAKE` | `DEFAULT_TIMEOUT_MS` |
| React component file | `PascalCase.tsx` | `PromptEditor.tsx` |
| TS non-component file | `kebab-case.ts` | `use-streaming-run.ts` |
| Rust file | `snake_case.rs` | `ollama.rs` |
| Branch | `phase-N/feature-name` | `phase-1/streaming-output` |

### Commits — Conventional Commits

`feat:` new user-visible behavior · `fix:` bug fix · `chore:` tooling/deps/config
· `docs:` documentation only · `test:` adding/fixing tests · `refactor:` no
behavior change. One step = one commit (or a tight related series). PR title
matches the convention; PR body references "closes #N" when applicable.

### File size

- **Hard limit: 100 lines** including blank lines and headers (this guide is the
  sole exception — see CLAUDE.md rule #3).
- At 95 lines, split now. Do not wait. Splits are by concern, not by halving.

### Comments

- Default: write none. Naming + structure carry the meaning.
- Write a one-line comment only when the *why* is non-obvious (a workaround, a
  subtle invariant, a constraint not visible in the code).
- Never reference tickets, callers, or "I added this for…".

### Errors

- Rust: `Result<T, AppError>` only. No `unwrap()` outside tests.
- TS: discriminated unions returned across IPC. No thrown errors over the IPC
  boundary.

### Tests

- Live next to code: `__tests__/` in TS, inline `#[cfg(test)]` in Rust,
  integration in `backend/tests/`.
- Name tests after the behavior, not the function: `streams_tokens_in_order`
  not `test_run_prompt`. One behavior per test.

### Colors & imports

- All colors flow through the theme tokens in `frontend/src/styles/tokens.css`.
  Use Tailwind palette classes (token-backed) or the `surface`/`ink` semantic
  colors. No hardcoded hex outside `tokens.css`.
- Absolute imports for cross-feature in TS (`@/shared/...`); relative within a
  feature. Rust: prefer `use crate::module::...` over deep relative paths.

---

## Workflow

The single most important section in the repo. Follow it literally — one step
at a time.

For every unit of work (one step, one ticket, one feature slice):

```
[1] Understand the step
    └─ Read the spec from the roadmap or the user message.
    └─ Write down expected input and expected output BEFORE writing any code.

[2] Implement the minimum
    └─ Smallest code change that could satisfy the spec.
    └─ No speculative abstractions. No "while I'm here" cleanup.

[3] Write the test
    └─ One test per behavior. Name it after the behavior, not the function.
    └─ Tests live next to code: src/.../__tests__/ or backend/tests/.

[4] Run the test
    └─ It must pass. If it does not, fix the code (not the assertion).

[5] Verify the output (DATA QUALITY GATE)
    └─ A green test is NECESSARY but NOT SUFFICIENT.
    └─ Print/log the actual output. Eyeball it.
    └─ Does it match expected shape? types? values? edge cases?
    └─ See the Data quality section for the full checklist.

[6] Update docs
    └─ If behavior changed, update the section that describes it.

[7] Commit
    └─ Conventional Commits. One step = one commit (or a tight series).

[8] Move on
    └─ Only now is the next step allowed to begin.
```

### Common violations (do not do these)

- **Stacking steps.** "Let me knock out steps 1–3 then test." → No. Test after
  each one.
- **Loosening assertions to make tests pass.** If `assert_eq 42` fails because
  the output is 41, do not change to `assert > 40`. Fix the code.
- **Skipping verification because the test passed.** Tests verify the path you
  wrote; verification confirms the path was the right one.
- **Bundling docs into "I'll update them later."** Later does not exist.
- **Refactoring during a feature.** Open a separate branch/commit.

### Stop conditions

Stop and ask the user if a step's spec is ambiguous, the data-quality gate fails
and the fix would change the spec, a file is about to exceed 100 lines and the
split is non-obvious, or a test requires hardware that may not be present.

---

## Data quality

A passing test only means the code executed the path you described. Data quality
means the *output* is actually correct. Both gates must pass before a step is
done.

Tests lie when: mocks return canned values matching the assertion but not
reality; assertions check `result != null` but not contents; the function
returns the right type with wrong values; streaming emits tokens in the wrong
order/encoding/count; persistence "succeeds" but writes corrupted YAML.

### The verification checklist

After every green test, run through this:

1. **Shape** — Is the type what you expected (string vs object vs array)? Are
   required fields present, no surprise fields added? For streams: count of
   chunks, ordering, terminator behavior.
2. **Values** — Sample the actual values; in reasonable ranges? Numeric units
   correct (ms vs s, bytes vs MB)? Strings UTF-8, no BOM, no escape leaks?
   Timestamps correct timezone, monotonic where required?
3. **Edge cases** — Empty input → empty output (not crash/null). Very large
   input → handled or rejected with a clear error. Unicode/emoji/RTL → preserved.
   Malformed input → typed error, not a panic.
4. **Cross-boundary fidelity** — Rust → JSON → TS: does the field round-trip
   (snake_case vs camelCase!)? Disk → memory: YAML reloads byte-identical? Partial
   reads / disconnections handled?
5. **Determinism (where applicable)** — Same input → same output? If not, is the
   non-determinism documented?

### How to verify, and when it fails

- Print the output and read it; do not skim. For streams, dump first/last N
  chunks to a file. For persistence, `diff` the round-trip against the original.
  For IPC, log both sides and compare.
- When verification fails: do NOT relax the test — it was right. Fix the
  producing code and add a regression test. If the spec was wrong, update the
  spec AND the test together.
- Logging: verbose `println!` / `console.log` during development is fine; remove
  or gate behind a debug flag before commit. Never commit logs containing prompt
  content or user data.

---

## Phase roadmap

Where each phase begins and ends. Workflow per step is in [Workflow](#workflow)
(implement → test → verify output → docs → commit).

### Phase 1 — v0.1.0 (shipped)

Day-zero usable single-prompt workspace. Tests: 67 backend + 336 frontend
passing.

### Phase 2 — v0.2 Daily-driver polish (complete)

Turns v0.1 into a daily driver: prompts on disk, every inference knob exposed,
auto-rerun on save, error states that tell you what to do, ships on Windows +
Linux, keyboard-first coverage. Workspaces ship first so params, history, and
auto-rerun all attach to a real "current prompt file" from day one.

| # | Step | Status |
| --- | --- | --- |
| 2.4 | Workspaces & files | done (pending live GUI check) |
| 2.1 | Parameter controls | done (pending live GUI check) |
| 2.2 | Auto-rerun on save | done (pending live GUI check) |
| 2.3 | Prompt history | done (pending live GUI check) |
| 2.5 | Better error states | done (pending live GUI check) |
| 2.7 | Light + system theme | done (dark values need visual tuning) |
| 2.6 | Onboarding | done (pending live GUI check) |
| 2.10 | Keyboard shortcuts | done (pending live GUI check) |
| 2.8 | Windows + Linux builds | done (CI authored; needs a tag run) |
| 2.9 | Auto-update polish | done (pending live GUI check) |

Locked decisions: workspaces are folders of `*.quantamind.yaml` files (no
tauri-plugin-sql); hotkeys are a hand-rolled `useHotkey` (no new dep); Windows
ships unsigned in 2.8 (cert deferred to [Future considerations](#future-considerations)).
Never add in Phase 2: browser-based inference, team features, cloud sync
(multi-model comparison already shipped in v0.1).

Step-level acceptance gate (each step "done" only when all true): code merged
behind a `phase-2/<step>` PR; full Vitest + cargo suites green; output verified
per [Data quality](#data-quality); relevant docs updated in the same commit; no
file >100 lines; locked stack honored.

**Phase 2.4 complete** — backend 95 lib + 2 lifecycle integration; frontend 361
(11 new for workspaces). Verified via `workspace_lifecycle.rs` (round-trip, tree
order, rename/delete, hidden-dir skip, human-readable YAML). Not yet exercised in
a live Tauri window (folder picker needs a GUI + display).

### Phase 3 — v0.3 "The Bench" (complete)

A dedicated model-comparison Bench: per-panel params, output diff, metrics, saved
configs, and prompt templates.

Steps 3.1–3.3 done: the `InferenceBackend` trait, the llama.cpp `llama-server`
sidecar backend, and a left **backend switcher** that scopes the Workspace to
Ollama or llama.cpp. Steps 3.4–3.9 done: a dedicated **Bench** tab with
seq/parallel + VRAM gate, word-level diff, metric bar charts, saved
`*.bench.yaml` configs, a quantamind.co report footer, and a bundled
prompt-template library.

**Step 3.10 (cloud baseline) is dropped from Phase 3.** The
`InferenceBackend`/`BackendKind` design stays open to a cloud variant (see the
forward-looking notes in `inference/backend/`), so a future phase can add it
without rework. With 3.10 out of scope, Phase 3 ships at 3.1–3.9 and is complete.

### Phase 4 — v0.4 "The Inspector" (complete)

Performance instrumentation: surface the raw timing/memory signal behind a run
so users can see *why* it was fast or slow. Built one step at a time.

- **4.1 Per-token timing instrumentation (done).** `RunTiming` records a
  `TokenTiming { text, t_ms, n }` per accepted token (`t_ms` = ms since run
  start, monotonic; `n` = 1-based count). The `prompt-done` event's
  `DonePayload` gains a `timeline` array, mirrored by the frontend zod schema.
  The first entry's `t_ms` equals `ttft_ms` by construction. Foundation for the
  views below; no UI yet.
- **4.2 Token-timeline chart (done).** New **Inspector** tab plots the last
  run's per-token latency (x = token index, y = gap from previous token) with
  the TTFT bar annotated and latency-spike gaps flagged as outliers (robust
  median/MAD modified-z rule). Pure math in
  `features/inspector/format/timeline.ts`; rendered with `visx` v4 (`@next`).
  Driven off `compareStore.rows`, so it shows **one labeled chart per model**
  for both single and multi-model runs (Compare now carries a per-token
  `timeline` on its done event). Hovering a bar shows a `#index · ms — token`
  readout.
- **4.3 TTFT breakdown (done).** `generate` now returns a `GenerateStats` from
  each backend's final chunk (Ollama's `load_duration`/`prompt_eval_*`/`eval_*`,
  ns→ms; llama.cpp's `timings`), carried on the done payloads. The Inspector
  shows a stacked TTFT bar per model — Model load + Prompt prefill +
  Network/first-token (remainder) — segmented only by what the backend reports;
  otherwise "not available". Pure math in `features/inspector/format/ttft.ts`.
- **4.4 VRAM allocation (done).** `get_loaded_models` reads Ollama `/api/ps`;
  the Inspector shows a per-model bar — In VRAM (`size_vram`) vs offloaded to
  system RAM (`size − size_vram`), `context_length` in the tooltip. Models not
  loaded / non-Ollama backends → "Not available" (never a fabricated
  weights/KV/free split). Device free/total VRAM deferred to 4.5 (GPU probe).
- **4.5 Hardware detection (done).** CPU/cores/RAM/OS/arch via `sysinfo` + a
  shell-out GPU probe (`nvidia-smi` CSV → bytes; macOS `sysctl` chip name +
  unified memory; else "Not available") in a new **Settings › Hardware** view.
- **4.6 Inter-token latency histogram (done).** Per-model visx histogram of the
  inter-token gaps; outlier bins highlighted (`format/histogram.ts`).
- **4.7 Cold- vs warm-start (done).** `HistoryEntry` records ttft/tok-s/load_ms;
  the Inspector compares cold (load_ms>500ms) vs warm runs per model and shows
  the cold-load TTFT delta (`format/coldwarm.ts`).
- **4.8 Memory-leak heuristic (done).** `get_ollama_rss` (sysinfo processes)
  sampled per run into a session series; a banner flags a monotonic climb across
  5 runs (`format/leak.ts`).
- **4.9 Regression alerts (done).** Per model, the latest run is compared to the
  rolling 7-day average of prior same-prompt runs (from history); a ≥20% tok/s
  drop is flagged (`format/regression.ts`).
- **4.10 HTML report (done).** A self-contained inline-SVG/HTML report (hardware,
  per-model metrics, TTFT/VRAM bars, timeline + histogram, cold/warm +
  regression) exported via the dialog + `save_compare_report` (now allows
  `html`). Builders in `features/inspector/report/`.

**Phase 4 (v0.4 The Inspector) is complete (4.1–4.10).** Metrics stay nullable
(`null` = not measured, never `0`); reports follow
[#analysis-schema](reference.md#analysis-schema). Tests: full `cargo test`
green + `cargo clippy` error-free; 560 frontend (vitest) + `tsc`; `pnpm build`
succeeds. Shipped on branch `phase-4/per-token-timing`. Live GUI verification
pending (same gate as earlier phases).

### Phase 5 — v0.5 Quantization & Backends (in progress)

Broaden *which* models and backends users can run, and help them pick the right
one. Built one step at a time.

- **5.1 MLX inference backend (in progress).** A `MlxBackend` streams from
  `mlx_lm.server`'s OpenAI-compatible `/v1/chat/completions` (SSE), reached over
  HTTP — no FFI, consistent with the locked stack. **Apple Silicon only.**
  mlx_lm is user-installed (`pip install mlx-lm`), not bundled; QuantaMind only
  health-probes it read-only via `GET /v1/models` and shows MLX in the workspace
  backend rail only on Apple Silicon. `BackendKind::Mlx` listens on `:8082`
  (mlx_lm defaults to `:8080`, which collides with llama-server — launch with
  `--port 8082`). Wire mapping: `num_predict→max_tokens`, `top_k→top_k`,
  `repeat_penalty→repetition_penalty`; **`seed` is dropped** (mlx_lm has no seed
  field, so MLX runs are **not seed-reproducible**). Stats are token counts only
  (all `*_ms` stay `None` — mlx_lm reports no per-phase timing); TTFT and
  tokens/sec come from the client-side `RunTiming`. Sub-steps: 5.1.1 enum +
  endpoint + dispatch; 5.1.2 wire request; 5.1.3 stats; 5.1.4 stream + backend;
  5.1.5 cancellation; 5.1.6 health command + Apple-Silicon gate; 5.1.7 frontend
  rail + gating + not-detected hint; 5.1.8 docs.
- **5.2 Model download manager.** Extend `features/models/` to list GGUF / MLX /
  AWQ variants with size, quality estimate, hardware fit, and resumable HF pulls.
- **5.3 Quantization comparison view.** Run one model across quants
  (Q4_K_M/Q5_K_M/Q8_0) side-by-side via the compare runner; show quality (mini
  eval), speed, size, VRAM.
- **5.4 Built-in mini-eval suite.** 5–10 small evals (HumanEval subset,
  summarization, classification, reasoning) scoring any model.
- **5.5 Smart quant recommender.** Combine `HardwareSnapshot` + use case + 5.4
  eval data to recommend a quant.
- **5.6 Backend auto-selection.** Given a model, auto-pick MLX (Apple Silicon,
  supported) / llama.cpp / Ollama; user override.
- **5.7 Model card viewer.** Inline HF model-card render (description, license,
  recommended use) in the model browser.

### Phase 6+

Owners flesh out the next phase's section here when the current lands.

---

## Future considerations

Parking lot for ideas, libraries, and changes deliberately deferred. Nothing
here is in the current phase — see [Phase roadmap](#phase-roadmap). If something
here becomes relevant, move it into a phase plan first.

### Apple Developer ID + notarization (macOS)

**Why deferred:** $99/yr Apple Developer Program + ~24-48h approval. Current
ad-hoc signing (`signingIdentity: "-"`) eliminates the "damaged" error; testers
right-click → Open past the "unverified developer" warning. Acceptable for
v0.1.x tester distribution. **Activate when:** moving to a public one-click
download, or a tester refuses to right-click → Open.

Enrollment checklist: enroll at developer.apple.com/programs; in Xcode →
Settings → Accounts add the Apple ID, then Manage Certificates → "+" →
**Developer ID Application**; note the **Team ID**; generate an **app-specific
password** (label "notarytool"); export the env vars before `scripts/release.sh`:

```sh
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="abcd-efgh-ijkl-mnop"   # the app-specific password
export APPLE_TEAM_ID="TEAMID1234"
```

`scripts/notarize.sh` detects the env vars, re-signs the `.app`/`.dmg` with
hardened runtime, submits to Apple, waits, and staples the ticket. Verify with
`xcrun stapler validate dist/*.dmg` and `spctl --assess --verbose=4`. Known
notarytool rejections: missing secure timestamp (add `--timestamp`), JIT not
entitled (add `com.apple.security.cs.allow-jit` to `macos.entitlements`),
hardened runtime not enabled (confirm `--options runtime`).

### scripts/release.sh exceeds 100-line file limit

`scripts/release.sh` is 138 lines — a pre-existing violation of CLAUDE.md rule 3.
Split into `release.sh` (orchestrator), `bump-version.sh`, `build-bundle.sh`, and
`write-manifest.sh` in a dedicated refactor commit. No behavior change; each
split file <100 lines.

### Windows code-signing certificate

**Why deferred:** an OV/EV cert is $200-400/yr plus identity verification; EV
certs ship on a hardware token (or cloud HSM) that CI must reach. v0.2 ships the
`.msi`/`.exe` **unsigned**, so SmartScreen shows "Windows protected your PC"
once — users click **More info → Run anyway**. **Activate when:** Windows becomes
a primary target or a tester refuses the warning. Checklist: buy OV (instant-ish)
or EV (clears reputation faster); for OV export the `.pfx`, store base64 as
`WINDOWS_CERTIFICATE` and password as `WINDOWS_CERTIFICATE_PASSWORD`; set
`bundle.windows.certificateThumbprint` in `tauri.conf.json`; EV needs a cloud-HSM
signing service. Verify with `signtool verify /pa`.

### Intel Mac build target

Current builds are `aarch64-apple-darwin` only; Intel users get a "platform not
found" from the updater. Add `x86_64-apple-darwin` + a universal-binary `lipo`
step when an actual Intel tester appears.

