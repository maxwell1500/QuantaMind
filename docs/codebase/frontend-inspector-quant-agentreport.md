# Frontend — Inspector, Quant, Agent Report & Publish

File-by-file reference for the three local-analysis surfaces of the QuantaMind
desktop app and the Publish UI that closes the loop. React 18 + TS 5 + Zustand +
[visx](https://airbnb.io/visx) charts, all driven over Tauri IPC into the Rust
backend. Everything here is **single-turn / batch over already-measured data** —
no surface runs inference itself; they read run history, loaded-model VRAM, eval
reports, and hardware snapshots that other features produced.

Cross-links:
[backend-eval-engine](./backend-eval-engine.md) (readiness scoring + VRAM-fit
math) ·
[backend-publish](./backend-publish.md) (payload preview, signing, board POST,
login) ·
[backend-prompt-workspace-system](./backend-prompt-workspace-system.md) (hardware
snapshot, run history) ·
[frontend-eval](./frontend-eval.md) (the batch + cliff store these consume) ·
[frontend-compare-analysis](./frontend-compare-analysis.md) (the Analysis tab
that hosts Quant as a sub-tab) ·
[frontend-overview](./frontend-overview.md).

---

## Overview

**Why these surfaces exist.** A local-LLM operator needs to answer three
questions that no single number can: *Is this run healthy?* (Inspector), *Which
quantization should I run?* (Quant), and *Is this model good enough to deploy as
an agent?* (Agent Report). Each turns raw measurements into an honest, explained
verdict — never a fabricated score (see the `no-fake-metrics` rule: an unmeasured
value renders `N/A`/`—`, never a guess).

**What each produces.**

- **Inspector** — per-run *token-timing forensics* for the last run(s): a TTFT
  phase breakdown (model-load + prefill + first-token), a per-token latency
  timeline with robust outlier flagging, an inter-token jitter histogram, a
  cold-vs-warm start comparison, a VRAM-budget bar, plus a global memory-leak
  banner and a per-model speed-regression alert. Exportable as a self-contained
  HTML report.
- **Quant** (a sub-tab **merged into the Analysis** top-nav, not its own tab) —
  side-by-side comparison of one model family's installed quantizations across
  *size vs quality vs fit*: file size, KV-aware VRAM fit at a chosen context,
  eval pass-rate, and the headline tool-call composite spread (with per-quant Δ).
- **Agent Report** ("Local Agent Readiness Validator") — turns the last persisted
  eval batch into a 🟢 Ready / 🟡 Conditional / 🔴 Not-Ready verdict **per model**,
  scored against a chosen *profile* (thresholds) and *host hardware* (a VRAM cap).
  Exportable as PNG / Markdown / HTML, then **Publish** to the community board.

**How they chain.**

```
Workspace run ─▶ Inspector  (measure: timing, VRAM, leaks, regressions)
Eval batch ────▶ Quant      (score: pass-rate + tool-call spread per quant)
            └──▶ Agent Report (verdict: measurements × profile × hardware)
                      └──▶ Publish (preview → opt-in → board)
```

### Surface map

| Surface | Key components | IPC command(s) | State store | Backend doc |
|---|---|---|---|---|
| **Inspector** | `InspectorPage`, `ModelTimeline`, `TtftBreakdown`, `TokenTimeline`, `LatencyHistogram`, `ColdWarmPanel`, `RegressionAlert`, `LeakBanner`, `VramBar`, `ContextBudgetBar` | `get_hardware_snapshot`, `get_loaded_models`, `history_list`, (leak) process-RSS sampler | `compareStore` (rows), `leakStore` (RSS series), reads `cliffStore` | [prompt-workspace](./backend-prompt-workspace-system.md), [compare](./backend-compare.md) |
| **Quant** | `QuantPage`, `quantPick`, `recommend`, `useVramFit`, `useQuantEval`, `useQuantToolcall` | `inspect_model`, `estimate_kv_cache_bytes`, `list_evals`+`run_eval_task`, `run_toolcall_eval`, `get_hardware_snapshot` | `installedModelsStore`, `selectedModelStore`, local hook state | [eval-engine](./backend-eval-engine.md), [models-hf-gguf](./backend-models-hf-gguf.md) |
| **Agent Report** | `AgentReportPage`, `VerdictTable`, `RecommendationBanner`, `ExecutiveVerdict`, `TierProgressionMatrix`, `FailureTaxonomy`, `EditProfileModal`, `ExportMenu`, `StatusBadge` | `assess_readiness`, `list_readiness_profiles`, `save_readiness_profile`, `get_hardware_snapshot`, `get_hardware_tier`, `save_readiness_image` | `readinessStore`, reads `evalRegistryStore` | [eval-engine](./backend-eval-engine.md) |
| **Publish** | `PublishButton`, `PublishDialog`, `WhatsSharedPanel`, `writeupLink` | `preview_publish_payload`, `publish_to_board`, `start_login` | none (passes `verdicts` through) | [publish](./backend-publish.md) |

---

## 1. Inspector

`features/inspector/` — a hidden-but-mounted tab. `InspectorPage` re-reads
`/api/ps` + run history every time the tab is opened (the model that just ran is
loaded by then), then renders one `ModelTimeline` per compare row that has a
`timeline`. The `format/*` modules are **pure transforms** that turn raw IPC data
(per-token timings, GGUF stats, history entries, RSS samples) into chart series;
the components are thin renderers over them.

### `format/timeline.ts` — per-token latency bars + robust outlier flagging — **IMPORTANT**

**Responsibility:** decompose a `TokenTiming[]` stream into latency bars; flag
spikes. **Why:** mean+2σ over heavy-tailed token latencies lets a few spikes
inflate the threshold and hide the rest, so it uses the robust Iglewicz–Hoaglin
modified z-score (median/MAD), falling back to mean+2σ only when MAD is 0
(near-quantized gaps). **What:** bar 0 is the TTFT (annotated separately); every
later bar is the gap from the previous token; `kind` is `ttft`/`normal`/`outlier`.
**Used by** `ModelTimeline`, `histogram`, the HTML report.

```ts
const med = median(gaps); const mad = median(gaps.map((g) => Math.abs(g - med)));
// Upper-tail modified z-score > 3.5  ⇔  gap > median + (3.5/0.6745)·MAD.
const threshold = mad > 0 ? med + (3.5 / 0.6745) * mad
  : std > 0 ? mean + 2 * std : Infinity;
const kind: BarKind = canFlag && latencyMs > threshold ? "outlier" : "normal";
```

### `format/ttft.ts` — TTFT phase decomposition — **IMPORTANT**

**Responsibility:** split a measured TTFT into *Model load* + *Prompt prefill*
(server-reported) + *Network/first-token* (the remainder). **Why:** only segments
backed by real backend data are emitted — `available:false` when the backend
reported neither, so the UI shows "not available" instead of one fabricated bar.
**Used by** `TtftBreakdown`, the HTML report.

```ts
const available = load != null || prefill != null;
if (!available) return { segments: [], total: ttftMs ?? 0, available: false, promptTokens };
if (load != null) segments.push({ key: "load", label: "Model load", ms: load });
if (prefill != null) segments.push({ key: "prefill", label: "Prompt prefill", ms: prefill });
if (ttftMs != null) segments.push({ key: "remainder", label: "Network + first token",
  ms: Math.max(0, ttftMs - (load ?? 0) - (prefill ?? 0)) });
```

### `format/histogram.ts` — inter-token jitter distribution — **IMPORTANT**

**Responsibility:** bucket the inter-token gaps (TTFT bar excluded) into
equal-width latency bins so jitter is visible as a distribution; bins are capped
at the gap count (`Math.min(bucketCount, gaps.length)`) so tiny runs aren't
over-bucketed; `[]` for <2 gaps. A bin holding any outlier-flagged gap sets
`hasOutlier` (rendered rose). **Used by** `LatencyHistogram`, the HTML report.

### `format/coldwarm.ts` — cold-vs-warm start summary — **IMPORTANT**

**Responsibility:** partition a model's history into cold (`load_ms > 500`) vs
warm (`≤ 500`) runs and headline the **prompt-independent** cold-start cost
(`deltaLoadMs`), with TTFT shown as prompt-dependent context. **Why:** honest
tri-state via `coldWarmState` — `ready` / `insufficient` ("run cold then warm") /
`unsupported` (backend reports no `load_ms`, e.g. MLX/llama.cpp keep the model
resident) — so it never shows a forever-misleading "run it again" hint on a
backend that can't measure it. Returns `null` until ≥1 cold and ≥1 warm exist.

### `format/regression.ts` — speed-regression verdict — **IMPORTANT**

**Responsibility:** compare a model's latest run against the rolling **7-day**
average of its prior runs *with the same prompt + user*; `slow` when ≥20% below
baseline tok/s, else `ok`, else `insufficient` (no comparable prior run). Pure
(`nowMs` injected). **Used by** `RegressionAlert`, the HTML report. Never
fabricates a baseline.

### `format/leak.ts` + `state/leakStore.ts` — memory-leak heuristic — **IMPORTANT**

**Responsibility:** flag a suspected leak when the last *n* (=5) RSS samples are
the **same model** and rose monotonically with net growth above a 256 MB noise
floor. **Why:** requiring one model avoids false positives from model switches
(loading a different model legitimately raises RSS). `leakStore` is a session-only
(non-persisted, last-30) series of Ollama process RSS, sampled at each run
completion via `ollamaRss()`; tagging each sample with the model that ran is what
lets the heuristic ignore switch jumps.

```ts
// leak.ts
const w = series.slice(-n);
const sameModel = w.every((s) => s.model === w[0].model);
const monotonic = w.every((s, i) => i === 0 || s.rssBytes >= w[i - 1].rssBytes);
const growthBytes = w.at(-1)!.rssBytes - w[0].rssBytes;
return { suspected: sameModel && monotonic && growthBytes > floorBytes, growthBytes, samples };
// leakStore.ts — set((s) => ({ series: [...s.series, { model, rssBytes: rss }].slice(-30) }))
```

`LeakBanner` is global (not per-model): hidden under 5 samples, then amber-warns
or shows "stable". `RegressionAlert` is per-model: hidden when `insufficient`.

### `format/vram.ts` — VRAM footprint + loaded-model lookup

`vramUsage(sizeBytes, sizeVramBytes, deviceTotalBytes)` → resident bytes, offload
(spilled to RAM = `size − resident`), total (device pool, or model size when the
pool is unknown so the bar still renders), and clamped `pct`. `pickLoaded` matches
a run's model in `/api/ps` results tolerating the `:latest` tag both ways.

### `components/InspectorPage.tsx`

Reads `compareStore.rows` (single runs are mirrored in; multi-model runs already
multi-row), filters to rows with a non-empty `timeline`, and maps each to a
`ModelTimeline`. Pulls `useLoadedModels` (`/api/ps` VRAM), `useRunHistory`
(cold/warm + regression input), `useHardware` (device memory pool), and
`useParentWidth` (chart sizing). Shows an empty state until a run or STT
transcript exists; renders the global `LeakBanner` + an `ExportReportButton`, then
delegates STT timing to `SttInspectorSection`.

### `components/ModelTimeline.tsx`

The per-model console: header (tok/s, outlier count) → `TtftBreakdown` phase track
→ `VramBar` + `ContextBudgetBar` → metric cards → `ColdWarmPanel` +
`RegressionAlert` → hover readout → `TokenTimeline` SVG → `LatencyHistogram`. It
calls `buildLatencyBars` and `buildHistogram` once and threads the results down.

### Inspector trivial components (compact)

| File | Role |
|---|---|
| `TokenTimeline.tsx` | visx `<Bar>` chart: x = cumulative `tMs`, y = gap latency (scaled to `gapMaxMs` so jitter stays visible, TTFT clamps); dashed vertical phase-boundary lines (slate load / violet prefill / amber TTFT); per-bar invisible hit-rect drives hover. |
| `LatencyHistogram.tsx` | visx band/linear histogram of the `HistogramBucket[]`; outlier bins rose (`#e11d48`), hover shows the bin's `lo–hi ms · count`. |
| `TtftBreakdown.tsx` | stacked horizontal CSS bar (load/prefill/stream-gen) sized by `%`; shows "not available for this backend" via `buildTtftSegments(...).available`. |
| `VramBar.tsx` | ASCII-cell (`█`/`░`) memory monitor: model cells + system-base cells over the device pool, with an 85% OOM-risk marker; system base derived only when **both** VRAM totals are reported (else it would fabricate a figure). |
| `ContextBudgetBar.tsx` | ASCII context-window monitor: `prompt_eval_count / context_length`; overlays an indicative attention "cliff" marker from `cliffStore.cliffForModel(model)` (backend-hydrated, not browser-cached); hot at ≥95%. |
| `ColdWarmPanel.tsx` | renders `coldWarmState` → cold-start headline or the right "n/a" reason. |
| `RegressionAlert.tsx` | renders `regressionVerdict` → "on par" (gray) or amber "X% slower". |
| `LeakBanner.tsx` | renders `detectLeak(leakStore.series)`. |

### Inspector hooks

| Hook | Does |
|---|---|
| `useLoadedModels` | `get_loaded_models` (`/api/ps`) → `Map<name, LoadedModel>`; `refresh()` on demand; errors → empty map. |
| `useRunHistory` | `history_list` → `HistoryEntry[]`; errors → `[]`. |
| `useHardware` + `deviceMemory` | `get_hardware_snapshot` once; `deviceMemory` derives the pool total + `unified` flag (Apple RAM vs NVIDIA VRAM). |
| `useParentWidth` | `ResizeObserver` → container width for SVG sizing. |

### Inspector report (`report/`)

`ExportReportButton` gathers hardware + loaded-model VRAM + history on demand,
calls `buildInspectorHtml`, and writes the file via `saveCompareReport`.
`reportHtml.ts` is the document shell (inline CSS); `sections.ts` builds the
hardware block + a per-model `<section>` reusing the **same pure transforms** as
the live UI (`buildLatencyBars`, `buildTtftSegments`, `coldWarmSummary`,
`regressionVerdict`); `svg.ts` emits inline-SVG bar/histogram charts and a stacked
HTML bar with every attribute inline (no Tailwind/JS) so the one-pager is fully
self-contained and offline. `esc()` escapes every interpolated string.

---

## 2. Quant (Analysis sub-tab)

`features/quant/` — pick one model family that has **several quants installed** and
compare them. Quality/tool-call runs need Ollama (one llama.cpp/MLX server can't
switch quants); size, fit, and the recommendation work on any backend.

### `quantPick.ts` — grouping — **IMPORTANT**

**Responsibility:** group installed models into "same base model, different
quant" sets keyed by `family + parameter_size`. **What:** one row per
quantization (the same quant present under two backends is deduped, first wins);
models missing family/param-size/quant are skipped; variants sorted
smallest-first. Pure. **Used by** `QuantPage` to populate the model dropdown.

### `recommend.ts` — the recommendation logic — **IMPORTANT**

**Responsibility:** recommend a quant for a use case. **How:** `fast-chat` →
smallest (fastest) *fitting* variant; quality use cases → highest-quality fitting
one, ranked by `quantRank` (an ordering over `Q2…Q8/BF16/F16` families). **Fit is
KV-aware** when dims are known (base + KV cache at the chosen context, consistent
with the table) else the file-size heuristic; honest when nothing fits or hardware
is unknown.

```ts
const fitOf = (v) => kvBytes != null ? fitOfNeed(v.sizeBytes + kvBytes, avail)
                                     : memoryFit(v.sizeBytes, avail);
const fits = hw ? variants.filter((v) => fitOf(v) !== "wont-fit") : variants;
if (hw && fits.length === 0) return { pick: null, why: `None of these quants fit your ~${formatBytes(avail)} ...` };
const pick = [...fits].sort((a, b) => speedFirst
  ? a.sizeBytes - b.sizeBytes : quantRank(b.quantization) - quantRank(a.quantization))[0];
```

### `useVramFit.ts` — KV-aware fit input — **IMPORTANT**

**Responsibility:** fetch a model's architecture dims (`inspect_model`, Ollama
`/api/show`) then the KV-cache bytes for the chosen context (`estimate_kv_cache_bytes`
— the canonical Rust formula, not a JS copy). `dims`/`kvBytes` are `null` for
non-Ollama or missing metadata → caller falls back to the file-size heuristic
(flagged `~`). Dims are identical across a family's quants, so it fetches once for
the group's first variant.

### `useQuantEval.ts` & `useQuantToolcall.ts` — scoring — **IMPORTANT**

`useQuantEval`: runs the bundled quality suite (`list_evals` → `run_eval_task` per
variant), tallies `passed/total`; a backend error marks the variant `error`
(never reported as `0`, which would read as all-fail). `useQuantToolcall`: runs
the curated tool-call suite (`getBuiltinTasks` → `run_toolcall_eval`), records the
**composite** score; a backend error stores `null` → rendered "n/a", never a
fabricated 0. The tool-call spread is the headline differentiator between quants.

### `components/QuantPage.tsx` — the page + delta math — **IMPORTANT**

Orchestrates: group select, use-case select, context select (4K…128K, clamped to
`dims.context_length`), and three actions (Run quality evals, Run tool-call evals,
Compare in Workspace →). `predictFit(sizeBytes, kvBytes, avail)` gives per-row fit
+ an `oom` flag that disables running an over-budget quant (only when hardware is
actually known — unknown memory never blocks). `toolcallSpread` prints
`"Q4_K_M 71% · Q8_0 88%"`; `toolcallDelta` computes each quant's **percentage-point
delta vs the highest-quality scored quant** (the baseline), making lost quality
explicit:

```ts
const base = scored.reduce((a, b) => (quantRank(b.quantization) > quantRank(a.quantization) ? b : a));
const baseScore = scores[base.name] as number;
for (const v of scored) if (v.name !== base.name)
  deltas[v.name] = Math.round(((scores[v.name] as number) - baseScore) * 100);  // e.g. −17pp vs Q8_0
```

The table columns are Quant · Size · Fit (`OOM Risk` / badge, `~` = approximate) ·
Quality (`passed/total`) · Tool-calls (`%` + `±Npp` delta). `help.ts` holds the
page + column tooltip copy.

---

## 3. Agent Report

`features/agentReport/` — the readiness validator. `assess_readiness` does the
scoring in Rust (the verdict logic lives in [backend-eval-engine](./backend-eval-engine.md));
the frontend is presentation + profile editing + export. The store holds **none**
of it persistently — Rust is the source of truth (profiles on disk, verdicts
recomputed).

### `state/readinessStore.ts` — verdict state shape — **IMPORTANT**

**Responsibility:** hold profiles, the selected profile, current `verdicts`,
hardware, the VRAM `capBytes`, and `assessed` (distinguishes "not run yet" from a
genuinely empty result). `assess(collectionId)` → `assess_readiness(collectionId,
profileId, capBytes?)`; selecting a profile clears verdicts; `saveProfile` writes
to disk then reloads (so the active profile reflects new gates). Phase 9B adds
`hardwareTier` (`loadHardwareTier` → `get_hardware_tier`, best-effort) and
`focusedModel` (`setFocusedModel`) — the model the per-tier deep-dive targets.

```ts
assess: async (collectionId) => {
  const { selectedProfileId, capBytes } = get();
  if (!selectedProfileId) return;
  set({ loading: true, error: null });
  try {
    const verdicts = await assessReadiness(collectionId, selectedProfileId, capBytes ?? undefined);
    set({ verdicts, assessed: true, loading: false });
  } catch (e) { set({ error: String(e), loading: false, assessed: false }); }
},
```

**The verdict shape (`ModelVerdict`, mirrors Rust):** `{ model, backend,
verdict: { status: ready|conditional|not_ready, blocking[], conditions[], path:
prompt_based|native_fc }, memory?: { weights_bytes, kv_cache_bytes, total_bytes,
cap_bytes, context_length, fits, pressure, estimated? }, avg_steps?, effort?,
pass_k?, quantization?, cliff?: NotProbed|NoCliff|Collapsed|Broken, by_tier?:
TierStat[], failures? }`. Hard gate failed → `not_ready`; soft target exceeded →
`conditional`; nothing failing → `ready`. **A required-but-unmeasured metric blocks
— it never guesses.** Backend returns verdicts already ranked best-first. Phase 9B
adds `by_tier` (per-tier strict Pass^k + avg-steps + failures) and `failures`
(overall tally), both from the **native-first** source the verdict gated on — they
feed the deep-dive below.

**Per-domain tier accumulation + quant fallback (backend `assess_readiness`).**
Built-in tiers are *separate single-tier collections* (`easy-coding`,
`medium-coding`, …), so one report's `by_tier` holds a single tier. `assess_readiness`
loads the same domain's **tier-sibling** reports (via `list_builtin_collections`
filtered by the collection's `v2_header` domain) and unions each model's ladder with
`merged_by_tier_for` (pure `merge_by_tier`, keyed on `(model, backend)` — a different
model/backend is never pulled in, so no cross-model "Frankenstein ladder"). The
selected collection's tier entries win on collision; the headline `pass_k`/`status`
stay per the selected collection. A custom collection (no `v2_header`) skips the merge.
`quantization` is `resolve_quant`: the Ollama registry first, else
`quant_from_filename(model)` — so a llama.cpp/MLX/offline model still carries the real
quant the name encodes (publishable, never fabricated).

### `components/VerdictTable.tsx` — the verdict rows — **IMPORTANT**

Renders one row per model: Model Info (+ `prompt_based`/`native_fc` path label),
Quant (`modelQuant` falls back from `quantization` → `parseQuant(model)` → a regex
on the name → `—`), a `StatusBadge`, and a status-driven Memory & Diagnostic
breakdown. `not_ready` rows render `BLOCKING: [X <indicator>]` chips (mapped from
the reason text via `getIndicatorLabel`) plus a details line; `conditional` rows
list `! Latency / ! Efficiency / ! High Pressure` from the conditions. The
`showNativeFc` toggle filters native-FC rows. Hidden mirror elements
(`MetricsLine`, `MemoryLine`, `Reasons`) carry the raw `pass_k`/steps/effort/cliff
+ VRAM line + escaped reasons for assertions/screen readers.

### Per-model deep-dive (Phase 9B) — `tierCurve.ts` + 3 components — **IMPORTANT**

Below the multi-model table, a model `<select>` (`focusedModel`) opens a three-section
drill-down for one model. `tierCurve.ts` is the pure brain shared by the cards and the
verdict, so they can't disagree:

```ts
// deriveTierCurve(by_tier, minPassK): clearedSet = tiers whose rate ≥ min_pass_k (the
// SAME bar the backend's cleared_tier uses); tierTested = max(runTiers); clearsThrough =
// highest tier cleared CONTIGUOUSLY from the lowest run tier (null if the lowest failed).
// status: READY iff clearsThrough==tierTested; NOT READY iff clearedSet empty; else CONDITIONAL.
```

- **`ExecutiveVerdict.tsx`** — headline tier = `tierTested` (what actually ran), **not** the
  profile's `required_tier`. Hardware class (`get_hardware_tier`) is an **advisory lens**: a
  run below `recommended_tier` shows a "run a harder tier" note but is **never** force-failed.
  Lens-1 prose branches on `clearedSet` emptiness FIRST (so "nothing cleared" and the
  non-monotonic "cleared X but missed a lower tier" read differently though both have
  `clearsThrough==null`). Uses its own status, independent of the profile gate.
- **`TierProgressionMatrix.tsx`** — four tier cards: measured Pass^k + avg-steps, a
  `CLEAR/SATURATED/FAIL` badge on the same `min_pass_k` bar, and `NOT TESTED` (gray) for a
  tier absent from `by_tier` (never a guessed fail). "Task Parameters" (Horizon/Decoys) come
  from real task `axes` via `deepDive.axesByTier`, or read "not declared".
- **`FailureTaxonomy.tsx`** — failure-mode distribution (`unknown_tool_calls`→decoys,
  `forbidden_calls`→must_not_call, loops, hallucinations…) summed across the **tested**
  tiers (named in the heading), as a share of tracked failure *events* (not failed runs).
- **`deepDive.ts`** — `axesByTier(tasks)` (real per-tier Horizon/Decoy ranges or absent) +
  `deepDiveJson(verdict,…)` (versioned `schema_version` JSON export).

### `export/markdown.ts` — shareable Markdown — **IMPORTANT**

**Responsibility:** build an offline GFM readiness report (pure, no DOM/network).
**Why:** every cell escapes the `|` delimiter so a model name with a pipe can't
break the table; unmeasured metrics render `N/A`, never fabricated; a leading
disclaimer states verdicts are "measured against this profile, not objective
truth"; hardware fields are dropped when unmeasured.

```ts
const cell = (s) => s.replace(/\|/g, "\\|");
const tableRow = (m) => `| ${cell(m.model)} | ${cell(m.backend)} | ${STATUS_LABEL[m.verdict.status]} | `
  + `${pct(m.pass_k)} | ${num(m.effort)} | ${num(m.avg_steps, 1)} |`;
// header: `> Verdicts are measured against the **${profile.name}** profile, not objective truth.`
```

### `export/snapshot.ts` — PNG rasterizer

`snapshotPng(node)` clones the report card into an SVG `<foreignObject>` via
`html-to-image`. Two guards: (1) resolve `@font-face` CSS once and feed it to the
real capture so Inter ships as data URIs, and (2) a throwaway warm-up render forces
asset loading before the real capture. Hardcodes `backgroundColor:#ffffff` (so a
dropped background never exports white-on-transparent) and `pixelRatio:2`.

### Agent Report — supporting files (compact)

| File | Role |
|---|---|
| `components/AgentReportPage.tsx` | the page shell: Section 1 (hardware badge, VRAM-cap select, profile select, collection select, Run) + Section 2 (banner + table + the Phase-9B deep-dive: model select → `ExecutiveVerdict`/`TierProgressionMatrix`/`FailureTaxonomy` + Export JSON); footer wires `ExportMenu` + `PublishButton`. Re-assesses when the cap changes, a profile is saved, **or an eval batch finishes for the shown collection or a same-domain tier sibling** (an effect on `batchStore.report`, gated on `assessed`; `assess` writes only `verdicts`, so no loop) — so a freshly-run model/tier shows without a manual Run Validation. Defaults `focusedModel` to the recommended verdict. Holds `cardRef` for the PNG snapshot. |
| `components/RecommendationBanner.tsx` | frames `verdicts[0]` (already the best pick): clear when Ready, caveated "best available" when Conditional, "no model is ready — closest" when none qualify (never a fabricated Ready); surfaces a "conservative estimate" note when `memory.estimated`. |
| `components/EditProfileModal.tsx` | a real editor for the active profile's gates (Min Pass^k, forbid loops/hallucination, require full VRAM / native FC, max steps/latency, min context); `numOrNull` maps blank→`null` ("off"); saves via `save_readiness_profile` then re-assesses. |
| `components/ExportMenu.tsx` | dropdown → PNG (`snapshotPng`→`save`→`save_readiness_image`), Copy Markdown (`buildReadinessMarkdown`→clipboard, surfaces focus rejections), Export HTML (`buildReadinessHtml`→download). All offline, no auth. |
| `components/StatusBadge.tsx` | `[ 🟢 READY ]` / `[ 🟡 WARN ]` / `[ 🔴 FAIL ]` chip. |
| `components/HostHardwareProfile.tsx` | standalone hardware panel (UMA-vs-discrete arch chips, cap dropdown, threshold list). Largely superseded by the inlined controls in `AgentReportPage`. |
| `capBytes.ts` | `defaultCapBytes` (UMA total / VRAM / RAM); `capOptions` offers only caps ≤ physical memory (simulating a *smaller* box is meaningful, more than you have isn't); `archLabel`. |
| `reportHtml.ts` | self-contained HTML one-pager (inline CSS, every string escaped); per-row VRAM line + reasons; reuses inspector's `esc`. |
| `readinessHelp.tsx` | in-app InfoButton copy explaining the verdict model, native-FC path, VRAM cap, and profiles. |

---

## 4. Publish

`features/publish/` — the privacy gate between a local verdict and the community
board. Default-OFF opt-in, aggregate-only.

### `PublishDialog.tsx` — preview-before-share — **IMPORTANT**

**Responsibility:** build the **exact** payload preview in Rust
(`preview_publish_payload(verdicts)`), show the user precisely what will and won't
leave the machine (`WhatsSharedPanel`) plus the raw canonical JSON, and require an
explicit tick + an allow-listed write-up link before Publish enables. **Why:** a
result is only publishable once it has a *measured Pass^k* and a *known
quantization*; the empty/excluded states explain why a model was dropped, and
`disabledReason` is surfaced as the button tooltip so a greyed-out Publish is
never a dead end. (The *quantization* requirement is satisfied for non-Ollama
backends too: `assess_readiness` falls back to parsing the quant from the model
name, so a measured llama.cpp/MLX/offline-Ollama row is no longer dropped with a
spurious "0 rows" / "no measured results".)

```ts
const canPublish = !!preview && preview.rows.length > 0 && !preview.invalid && agreed && linkOk;
const disabledReason = !preview ? "Building the payload preview…"
  : preview.invalid ? `Row ${preview.invalid.index} failed validation`
  : preview.rows.length === 0 ? "No measured results to publish yet"
  : !agreed ? "Tick the opt-in box to publish"
  : !linkOk ? "Write-up link isn't on the allow-list" : "";
```

### `WhatsSharedPanel.tsx` — the transparency panel — **IMPORTANT**

Two columns: **Shared** (metrics, hardware cohort tags, model+quant, integrity
hash+signature) with ✓, and **Never shared** (task content/prompts, file paths,
raw output/traces, anything beyond the GitHub handle) struck through — the privacy
guarantee made visual. This is the one control that keeps a custom eval suite from
leaking.

### Publish — supporting files (compact)

| File | Role |
|---|---|
| `PublishButton.tsx` | "🚀 Deploy" → opens the dialog; `onPublish` handles every `publish_to_board` outcome as a toast/next-action without freezing the UI: `ok` (open board URL), `needs_auth` (→ `start_login`, retry **once**, warn if Keychain denied), `invalid`/`rate_limited`/`update_required`. |
| `writeupLink.ts` | `isAllowedWriteupLink` — empty allowed; otherwise must be an `https` URL whose host is (a subdomain of) github.com, x.com, twitter.com, dev.to, reddit.com, medium.com, youtube.com, or huggingface.co. Keeps the board from becoming a link farm. |

---

## Data-flow walkthroughs

**(a) Run history → Inspector charts.** A Workspace run writes its metrics into
`compareStore.rows` (and a `HistoryEntry` to disk). Opening Inspector triggers
`useLoadedModels` (`get_loaded_models`) + `useRunHistory` (`history_list`) +
`useHardware` (`get_hardware_snapshot`). For each charted row, `ModelTimeline`
calls `buildLatencyBars` (→ `TokenTimeline` + outlier count), `buildHistogram` (→
`LatencyHistogram`), `buildTtftSegments` (→ `TtftBreakdown`), `vramUsage` (→
`VramBar`), and feeds history to `coldWarmState`/`regressionVerdict`. Separately,
`leakStore.sample(model)` appends an RSS reading each run; `LeakBanner` reads the
series through `detectLeak`. `ExportReportButton` re-gathers the same inputs and
emits a self-contained HTML report.

**(b) Quant compare → recommendation.** `QuantPage` reads installed models →
`groupQuantVariants` → the family dropdown. For the selected group it calls
`useVramFit(firstVariant, ctxLen)` → `inspect_model` + `estimate_kv_cache_bytes` →
`kvBytes`. Per row, `predictFit(size, kvBytes, avail)` gives fit + OOM gating;
`recommendQuant(usecase, hw, variants, kvBytes)` picks the smallest-fitting
(fast-chat) or highest-quality-fitting (quality) variant → the banner. "Run
quality evals" / "Run tool-call evals" populate the Quality and Tool-calls columns
(`useQuantEval`/`useQuantToolcall`); `toolcallSpread` + `toolcallDelta` annotate
the per-quant quality lost to fewer bits.

**(c) Measurements → readiness verdict → publish.** The user runs an eval batch on
the **Eval** tab (persisted per collection). Agent Report's `loadProfiles` +
`loadHardware` seed the controls; **Run Validation** calls
`assess_readiness(collectionId, profileId, capBytes)` → `ModelVerdict[]` (Rust
scores measurements × profile gates × VRAM cap). `RecommendationBanner` frames
`verdicts[0]`; `VerdictTable` renders the rows; `ExportMenu` exports PNG/MD/HTML.
**Deploy** opens `PublishDialog`, which calls `preview_publish_payload(verdicts)`
to show the exact aggregate JSON; after the opt-in + allow-listed link,
`PublishButton` calls `publish_to_board` (auto-running `start_login` once on
`needs_auth`) and opens the board URL on success.
