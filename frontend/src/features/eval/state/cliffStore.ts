import { create } from "zustand";
import { runToolcallEval } from "../../../shared/ipc/eval/toolcall";
import { saveCliffResult, getCliffResults } from "../../../shared/ipc/eval/cliff";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { buildLadder, padTask, classifyCliff, type CliffPoint } from "../cliff";
import type { ToolTask } from "../../../shared/ipc/eval/registry";
import type { BackendKind } from "../../../shared/ipc/models/storage";
import type { InferenceParams } from "../../../shared/ipc/workspace/prompts";

/// What the Matrix carries to the Audit panel so the probe lands pre-filled
/// (NEVER auto-run — guardrail 1).
export interface CliffRequest {
  model: string;
  backend: BackendKind;
  collectionId: string;
  maxTokens: number;
  /// Pre-filled ladder depth (Test Steps) so the panel lands fully ready — the user
  /// can still adjust it before clicking Execute.
  steps: number;
}

export interface RunProbeArgs {
  model: string;
  backend: BackendKind;
  collectionId: string;
  tasks: ToolTask[];
  maxTokens: number;
  steps: number;
  params?: InferenceParams;
  /// Pin temperature 0 (greedy) so the verdict is REPRODUCIBLE for a given (model,
  /// collection) — a diagnostic must not flip run-to-run. Off → sample at the global
  /// temperature. Everything else still comes from `params`.
  greedy?: boolean;
}

interface CliffStore {
  /// A pending pre-fill request set by the Matrix, consumed by the panel.
  request: CliffRequest | null;
  /// The live probe series (one point per rung) — held in the store so the run
  /// survives tab navigation.
  points: CliffPoint[];
  running: boolean;
  /// The model currently being probed (for the Matrix "probing…" indicator).
  runningModel: string | null;
  progress: { done: number; total: number };
  error: string | null;
  /// Backend-hydrated cliff depths: collection → model (verbatim key) → tokens.
  results: Record<string, Record<string, number>>;
  /// (collection → model) probes that COMPLETED this session, including ones that found
  /// no cliff (so the Matrix can distinguish "probed, healthy" from "not probed"). Held
  /// in-session only — cross-session persistence of the no-cliff case is a follow-up.
  probed: Record<string, Record<string, boolean>>;
  /// (collection → model) probes whose UNPADDED baseline (rung 0) was already below the
  /// pass bar — the model fails from the start, so "✓ no cliff" would be a lie. The Matrix
  /// renders this as a failure state, not a healthy one. In-session only, like `probed`.
  brokenBaseline: Record<string, Record<string, boolean>>;

  setRequest: (req: CliffRequest) => void;
  consumeRequest: () => CliffRequest | null;
  hydrate: (collectionId: string) => Promise<void>;
  cliffFor: (collectionId: string, model: string) => number | null;
  /// The deepest measured cliff for a model across ALL collections — for the
  /// Inspector gauge, which has a model but no collection in scope.
  cliffForModel: (model: string) => number | null;
  /// Did a probe complete this session for (collection, model)? True even when no cliff
  /// was found — so the Matrix shows "✓ no cliff" rather than "Run probe ↗".
  wasProbed: (collectionId: string, model: string) => boolean;
  /// Did the probe's baseline fail (broken from the start)? When true the Matrix must NOT
  /// claim "✓ no cliff" — the model never had a healthy plateau to fall off.
  hasBrokenBaseline: (collectionId: string, model: string) => boolean;
  runProbe: (args: RunProbeArgs) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

// Module-level generation token: bumping it invalidates any in-flight run (stop /
// supersede), so a long sweep can be cancelled and a re-run never races the old one.
let activeRun = 0;

export const useCliffStore = create<CliffStore>((set, get) => ({
  request: null,
  points: [],
  running: false,
  runningModel: null,
  progress: { done: 0, total: 0 },
  error: null,
  results: {},
  probed: {},
  brokenBaseline: {},

  setRequest: (req) => set({ request: req }),
  consumeRequest: () => {
    const req = get().request;
    if (req) set({ request: null });
    return req;
  },

  hydrate: async (collectionId) => {
    try {
      const map = await getCliffResults(collectionId); // model → CliffStatus
      // Restore ALL states so broken/no-cliff survive a reload, not just collapse depths:
      // results = collapse depths; probed = any probed state; brokenBaseline = Broken.
      const results: Record<string, number> = {};
      const probed: Record<string, boolean> = {};
      const broken: Record<string, boolean> = {};
      for (const [m, st] of Object.entries(map)) {
        if (st.status === "NotProbed") continue;
        probed[m] = true;
        if (st.status === "Collapsed") results[m] = st.depth;
        else if (st.status === "Broken") broken[m] = true;
      }
      set((s) => ({
        results: { ...s.results, [collectionId]: results },
        probed: { ...s.probed, [collectionId]: probed },
        brokenBaseline: { ...s.brokenBaseline, [collectionId]: broken },
      }));
    } catch (e) {
      // best-effort — a missing/unreadable store just leaves the cell N/A — but log it.
      console.error("cliff hydrate failed:", e);
    }
  },

  cliffFor: (collectionId, model) => get().results[collectionId]?.[model] ?? null,
  cliffForModel: (model) => {
    const found = Object.values(get().results)
      .map((byModel) => byModel[model])
      .filter((v): v is number => v != null);
    return found.length ? Math.max(...found) : null;
  },
  wasProbed: (collectionId, model) => get().probed[collectionId]?.[model] === true,
  hasBrokenBaseline: (collectionId, model) => get().brokenBaseline[collectionId]?.[model] === true,

  runProbe: async ({ model, backend, collectionId, tasks, maxTokens, steps, params, greedy }) => {
    // GUARDRAIL 2: clear all prior state BEFORE dispatching — never append to a
    // stale series (that corrupts the chart and the persisted cliff).
    const myRun = ++activeRun;
    const ladder = buildLadder(maxTokens, steps);
    set({ points: [], error: null, running: true, runningModel: model, progress: { done: 0, total: ladder.length } });

    // The probe IS about context depth — give Ollama a window for the largest rung
    // (+ headroom), respecting a higher user num_ctx. No-op for llama.cpp/MLX.
    const probeParams = {
      ...params,
      num_ctx: Math.max(params?.num_ctx ?? 0, maxTokens + 2048),
      // Greedy → reproducible: pin temp 0 so the same (model, collection) yields the
      // same verdict on a re-run. Off → keep the global temperature.
      ...(greedy ? { temperature: 0 } : {}),
    };
    try {
      for (const padUnits of ladder) {
        if (activeRun !== myRun) return; // stopped or superseded
        try {
          const r = await runToolcallEval(model, backend, tasks.map((t) => padTask(t, padUnits)), "", probeParams);
          if (activeRun !== myRun) return;
          set((s) => ({
            points: [...s.points, { promptTokens: r.prompt_tokens, composite: r.composite }],
            progress: { ...s.progress, done: s.progress.done + 1 },
          }));
        } catch (e) {
          if (activeRun !== myRun) return;
          set((s) => ({
            points: [...s.points, { promptTokens: null, composite: null }],
            error: s.error ?? formatIpcError(e),
            progress: { ...s.progress, done: s.progress.done + 1 },
          }));
        }
      }
      // Completed (not cancelled): compute + persist the cliff depth. Re-check the
      // generation token first — a stop() in the micro-window between the last rung
      // and here must abandon the run WITHOUT persisting a partial cliff.
      if (activeRun !== myRun) return;
      const verdict = classifyCliff(get().points);
      const broken = verdict.kind === "broken-baseline";
      // Mark this (collection, model) as probed REGARDLESS of whether a cliff was found,
      // so the Matrix shows "✓ no cliff" (probed, accuracy held) instead of an unmeasured
      // "Run probe ↗" when accuracy never collapsed. Record the broken-baseline verdict
      // explicitly (true OR false) so a healthy re-run clears a stale broken flag.
      set((s) => ({
        probed: { ...s.probed, [collectionId]: { ...(s.probed[collectionId] ?? {}), [model]: true } },
        brokenBaseline: { ...s.brokenBaseline, [collectionId]: { ...(s.brokenBaseline[collectionId] ?? {}), [model]: broken } },
      }));
      // Persist the outcome so the Agent Report + a reloaded Matrix reflect it, not just
      // this session: cliff → Collapsed{depth}; no-cliff → NoCliff{tested}; broken →
      // Broken{tested} (a distinct state, never a fake depth); no-baseline → not
      // persisted (stays NotProbed).
      const tested = Math.max(0, ...get().points.map((pt) => pt.promptTokens ?? 0));
      let out: { depth: number | null; broken: boolean } | undefined; // undefined ⇒ skip
      if (verdict.kind === "cliff") out = { depth: verdict.depth ?? tested, broken: false };
      else if (verdict.kind === "no-cliff") out = { depth: null, broken: false };
      else if (verdict.kind === "broken-baseline") out = { depth: null, broken: true };
      if (out && tested > 0) {
        const persisted = out;
        try {
          await saveCliffResult(collectionId, model, persisted.depth, tested, persisted.broken);
          // `results` holds GENUINE collapse depths only (the Matrix's numeric source):
          // set it for a real cliff, clear it otherwise (no-cliff / broken render via
          // their own flags, never a misleading number).
          set((s) => {
            const col = { ...(s.results[collectionId] ?? {}) };
            if (verdict.kind === "cliff" && persisted.depth != null) col[model] = persisted.depth;
            else delete col[model];
            return { results: { ...s.results, [collectionId]: col } };
          });
        } catch (e) {
          set((s) => ({ error: s.error ?? formatIpcError(e) }));
        }
      }
    } finally {
      if (activeRun === myRun) set({ running: false, runningModel: null });
    }
  },

  stop: () => {
    activeRun++; // invalidate the in-flight run
    set({ running: false, runningModel: null });
  },

  reset: () => {
    activeRun++;
    set({ points: [], error: null, running: false, runningModel: null, progress: { done: 0, total: 0 } });
  },
}));
