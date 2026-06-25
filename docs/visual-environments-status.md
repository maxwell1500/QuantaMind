# Visual Deterministic Environments — Status & Roadmap

> Living tracker for the multi-slice effort. Updated as each slice lands.
> Full design rationale lives in the team's plan notes; this file is the at-a-glance state.
> **Last updated: 2026-06-24.**

## Goal
Let users **watch** a model act inside the agentic eval — browse files, search a corpus, drive a
web UI, read a document — fully **reproducible**, **private**, and **metrics-only-published**.
We extend the existing engine (runner, Pass^k, tiers, traps, honesty verdicts); we do **not**
pivot to live connections or MCP. Shipped as vertical slices, each validated **live + green in
CI** before the next.

## Load-bearing rules (do not violate)
- `ResponderKind` stays an **enum, not a trait** — compile-forced exhaustiveness on the
  determinism-critical `respond()` seam. `StaticMocks`/`WorldState` output is byte-parity-pinned
  by a golden test (incl. fault/recovery paths).
- A bug fix that changes a **published/hashed** collection's answer key ships as a **NEW
  versioned collection**, never an in-place edit. (`easy-coding-fs` is new + unpublished → editable.)
- The per-step `EnvView` / visual replay is **model output → local-only, NEVER published** (not on
  the publish allowlist). The leaderboard ships the bundled environment + metrics only.
- Env views are **pure functions of (immutable env, calls)** → the picture can never disagree
  with the score.
- **Frontend round-trip trap:** the UI parses backend tasks via `AgenticSpecSchema` and hands them
  back to `run_batch_eval`; Zod `z.object()` **strips any unlisted field**. Every new `AgenticSpec`
  field MUST be added to `frontend/src/shared/ipc/eval/registry.ts` or it is silently dropped (this
  exact bug hid the filesystem env → it ran in entity mode). Guarded by `registry.schema.test.ts`.

---

## ✅ Slice 1 — Phase 0 + Phase 1 — DONE
**PR #73**, branch `phase-9/visual-env-filesystem` (off `main`). Backend ~321 eval tests +
frontend ~217 green; live-verified on `qwen2.5-coder`.

**Phase 0 — env-view streaming spine**
- [x] `backend/.../agentic/env_view.rs`: `EnvView{None, FileSystem(FsView)}` +
  `env_view(responder, calls)` (exhaustive). `TrajectoryStep.env` streamed each turn; runner stamps it.
- [x] Zod mirror `EnvViewSchema` + optional `env` on `TrajectoryStepSchema`.
- [x] Golden byte-parity anchor on `respond()`.

**Phase 1 — simulated filesystem environment**
- [x] `ResponderKind::FileSystem(FsState)`; `v2/env_fs.rs` getters `read_file`/`list_dir`/
  `search_files`/`grep` return **real content** (or a deterministic not-found) — **acks-empty bug fixed**.
- [x] `EnvKind` field threads collection → spec → build (`"environment":"filesystem"`); entity path untouched.
- [x] New bundled `easy-coding-fs.json` (3 tasks; `write_file` = `must_not_call` decoy);
  `easy-coding.json` left untouched.
- [x] Oracle test covers it; forbidden-trap composition test (a forbidden `write_file` terminates).

**Visual UI — split-view replay**
- [x] `frontend/.../components/replay/{EnvironmentReplayPanel, FileTreeReplay, StepScrubber}.tsx`;
  `TraceDebugger` renders a 2-col split only when `hasEnvReplay(steps)`; non-env tasks unchanged.

**Bugs caught DURING live testing (why the live rule exists):**
- [x] env view used `calls.last()` → showed the trailing `reply`, not the batched `read_file`. Fixed.
- [x] **`environment` stripped by the frontend Zod round-trip** → fs collection ran in entity mode
  (no panel, "1 passed 2 failed"). Fixed by adding `environment` to `AgenticSpecSchema`.
- [x] grep checkpoint demanded exact query `"connect_db"` while models grep `"def connect_db"` →
  InfiniteLoop despite a correct reply. Fixed: globbed the checkpoint query (`*connect_db*`).

**Current model behavior (qwen2.5-coder):** `read_config` ✓, `grep` ✓, `list` = `ForbiddenCall`
(LEGIT — qwen writes a counting file, violating "do not modify"; the trap working as designed).
**Open:** the panel renders in-app — run `npm run tauri dev` to watch it (needs a GUI session).

---

## ✅ Slice 2 — Frozen web-search corpus — DONE (live-validated)
- `v2/env_corpus.rs`: `CorpusState` (frozen `doc_id→{title,text}`); `search(query)` → COMPUTED
  deterministic ranked snippets (distinct-term match, ties by `doc_id`), `fetch(doc)` → full text.
  `ResponderKind::WebCorpus`; `EnvView::WebCorpus(CorpusView)` (lazy: index id+title, plus this
  turn's results / fetched content). `EnvKind::WebCorpus`; wired in `build.rs`. Snippet = first
  query-term line top-to-bottom else head — pure, on the replay-vs-score surface.
- Bundled `easy-research-search.json` (3 tasks: search→reply, search→fetch→reply, abstain-when
  -absent; `edit_doc` must-not-call decoy). Registered in `V2_SCENARIOS`.
- UI `replay/CorpusReplay.tsx` (corpus index + ranked results w/ snippets + fetched-doc reader),
  wired into `EnvironmentReplayPanel`. **Lazy:** only the index ships per turn; full text rides
  along only for the fetched doc. Zod `EnvViewSchema` gains the `web_corpus` variant.
- **Status:** 337 backend + 232 frontend tests green (incl. the oracle solving all 3 corpus tasks
  end-to-end + a trivial agent failing). **Live gate PASSED** — qwen3.5:9b (confirmed `tools`-capable)
  on `es_rs_search_fact` reached the end state on BOTH the native path (`tool_calls`) and the prompt
  path (JSON-in-text), `failure=None`, EnvView carried the real ranked results
  (`live_web_corpus_passes_on_the_native_path` + `..._runs_on_the_prompt_path`).
- **Abstain-checkpoint fix:** `es_rs_abstain_when_absent` first graded the reply on the exact phrase
  `*not available*`; the native model correctly abstained in *different* words ("No document … was
  **found**") → end state unreachable → it looped re-replying → InfiniteLoop (a false negative).
  `glob_match` has no alternation, so the checkpoint is now the natural absence phrasing
  (`*no*document*found*`, ordered segments) — any correctly-worded abstain passes, only a fabricated
  radius fails. Live-validated native (`live_web_corpus_abstains_when_doc_absent_native`:
  search→"No matching document was found."→PASS). **Lesson: never grade free-text / abstain on one
  exact phrase — the matcher can't OR, and an unreachable reply checkpoint loops to the cap.**

## ⬜ Slice 3 — Web-UI environment (schematic SVG, state-diff) — NOT STARTED
- `v2/env_webui.rs`: per-**run** `WebUiState` machine (click/navigate/fill mutate it — held in run
  scope, NEVER in the immutable `ResponderKind`). `EnvView::WebUi`.
- New grader `EndStateRule::RequireEndState(target)` = exact state match, no partial credit; needs
  an oracle + trivial-agent-fails test; **forbidden-call terminality must still dominate** (a
  forbidden action fails even if the final state is correct — pin with a test).
- UI `replay/WebUiReplay.tsx` = **schematic SVG** (boxes/labels/state badges), not real HTML.

## ⬜ Slice 4 — Custom environments (imported + edited) — NOT STARTED
- 4a: runtime load of a user JSON/dir via `load_v2_collection`; `collection_hash = None` → excluded
  from publish (structural).
- 4b: **modifiable in-memory snapshots** (edit tree/content in-app) + **freeze-per-run** +
  **fork-on-edit guard** (editing a *bundled* snapshot flips `collection_hash` → `None` so a doctored
  copy can never publish under the real identity — security-critical; pin with a test).

## ⬜ Slice 5 — Vision OCR-as-capability — NOT STARTED
- Separate eval family (NOT a sandbox tool loop; own module `inference/eval/vision/`, NOT Pass^k).
- Model does image→text itself (**not RAG**); scored vs bundled ground truth (char/word WER, table
  preservation, **HallucinatedContent** verdict). Live → **decoupled from the leaderboard**.
- **Modality gate:** `probe_supports_vision`; a text-only model → "N/A" / "Cannot process", never a
  zero; an uncertain probe fails toward N/A. Never average a vision score with the tool-calling tiers.
- Byte-parity: the optional image field must not change the text-path request. The text-document
  variant's "frozen text" is bundled-at-authoring, never OCR'd live. UI = image | extracted-text diff
  (`diff-match-patch`) + an explicit "Cannot process — text-only model".

## Cross-cutting (fold into the slice that needs it)
- [ ] Native role-shaped tool results — NATIVE PATH ONLY (prompt path keeps `Tool result:` text).
- [ ] Docs per slice: `reference.md#agentic-eval`, `docs/codebase/backend-eval-engine.md`,
  `docs/codebase/frontend-eval.md`, README.
- [x] Determinism gate (same task + model + temp 0 → identical env views + verdict) — apply per env.

## How to verify a slice (live)
1. Backend unit + oracle + forbidden tests green: `cargo test --lib inference::eval`.
2. An `#[ignore]` live smoke against a real Ollama model (`qwen2.5-coder` is fast / text-only).
3. `npm run tauri dev` + run the collection; watch the replay panel react (GUI session).
4. **Restart the app after frontend schema changes** so tasks re-parse through the fixed schema.
