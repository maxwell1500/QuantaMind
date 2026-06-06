import { create } from "zustand";
import { runToolcallEval } from "../../../shared/ipc/eval/toolcall";
import { saveCliffResult, getCliffResults } from "../../../shared/ipc/eval/cliff";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { buildLadder, padTask, cliffPoint, type CliffPoint } from "../cliff";
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
}

export interface RunProbeArgs {
  model: string;
  backend: BackendKind;
  collectionId: string;
  tasks: ToolTask[];
  maxTokens: number;
  steps: number;
  params?: InferenceParams;
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

  setRequest: (req: CliffRequest) => void;
  consumeRequest: () => CliffRequest | null;
  hydrate: (collectionId: string) => Promise<void>;
  cliffFor: (collectionId: string, model: string) => number | null;
  /// The deepest measured cliff for a model across ALL collections — for the
  /// Inspector gauge, which has a model but no collection in scope.
  cliffForModel: (model: string) => number | null;
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

  setRequest: (req) => set({ request: req }),
  consumeRequest: () => {
    const req = get().request;
    if (req) set({ request: null });
    return req;
  },

  hydrate: async (collectionId) => {
    try {
      const map = await getCliffResults(collectionId);
      set((s) => ({ results: { ...s.results, [collectionId]: map } }));
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

  runProbe: async ({ model, backend, collectionId, tasks, maxTokens, steps, params }) => {
    // GUARDRAIL 2: clear all prior state BEFORE dispatching — never append to a
    // stale series (that corrupts the chart and the persisted cliff).
    const myRun = ++activeRun;
    const ladder = buildLadder(maxTokens, steps);
    set({ points: [], error: null, running: true, runningModel: model, progress: { done: 0, total: ladder.length } });

    // The probe IS about context depth — give Ollama a window for the largest rung
    // (+ headroom), respecting a higher user num_ctx. No-op for llama.cpp/MLX.
    const probeParams = { ...params, num_ctx: Math.max(params?.num_ctx ?? 0, maxTokens + 2048) };
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
      const cliff = cliffPoint(get().points);
      if (cliff != null) {
        try {
          await saveCliffResult(collectionId, model, cliff);
          set((s) => ({
            results: { ...s.results, [collectionId]: { ...(s.results[collectionId] ?? {}), [model]: cliff } },
          }));
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
