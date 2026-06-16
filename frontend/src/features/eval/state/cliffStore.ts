import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  runContextCliff,
  stopContextCliff,
  getCliffResults,
  EVENT_CLIFF_PROGRESS,
  type CliffSource,
  type CliffProgress,
} from "../../../shared/ipc/eval/cliff";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { type CliffPoint } from "../cliff";
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
  /// Which padding fills the context: an embedded synthetic preset or the user's
  /// own text. The backend engine cycles it, char-boundary-safe, to each verified depth.
  source: CliffSource;
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

  runProbe: async ({ model, backend, collectionId, tasks, maxTokens, steps, source, params }) => {
    // GUARDRAIL 2: clear all prior state BEFORE dispatching — never append to a
    // stale series (that corrupts the chart and the persisted cliff).
    const myRun = ++activeRun;
    set({ points: [], error: null, running: true, runningModel: model, progress: { done: 0, total: steps } });

    // Live per-rung points stream from the backend engine over `cliff-progress`; the
    // engine owns the ladder, padding, verify-and-adjust, classification, and
    // persistence (the Matrix/verdict read the stored status afterward).
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<CliffProgress>(EVENT_CLIFF_PROGRESS, (ev) => {
        const p = ev.payload;
        // Filter by run token, not model: two runs of the SAME model must not bleed into
        // each other. A superseded run's late (often cancelled/partial) events carry the
        // OLD run_id and are dropped here, so they never pollute the new run's chart.
        if (activeRun !== myRun || p.run_id !== myRun) return;
        set((s) => ({
          // verified_tokens 0 ⇒ the backend reported no count for this rung — render
          // it as "not reported", never a fake ≈0-token depth.
          points: [...s.points, { promptTokens: p.point.verified_tokens || null, composite: p.point.composite, trace: p.point.trace }],
          progress: { done: p.done, total: p.total },
        }));
      });

      const report = await runContextCliff(model, backend, collectionId, tasks, source, maxTokens, steps, params, myRun);
      if (activeRun !== myRun) return; // stopped or superseded mid-run

      // The report is authoritative — replace the live series with its verified rungs
      // so the chart and the (backend-persisted) status can never disagree.
      const points: CliffPoint[] = report.points.map((p) => ({ promptTokens: p.verified_tokens || null, composite: p.composite, trace: p.trace }));
      const broken = report.status.status === "Broken";
      set((s) => {
        const col = { ...(s.results[collectionId] ?? {}) };
        // `results` holds GENUINE collapse depths only — set it for a real cliff, clear
        // it otherwise (no-cliff / broken render via their own flags, never a number).
        if (report.status.status === "Collapsed") col[model] = report.status.depth;
        else delete col[model];
        return {
          points,
          // Mark probed REGARDLESS of outcome so the Matrix shows "✓ no cliff" rather than
          // an unmeasured "Run probe ↗"; record broken explicitly so a healthy re-run clears it.
          probed: { ...s.probed, [collectionId]: { ...(s.probed[collectionId] ?? {}), [model]: true } },
          brokenBaseline: { ...s.brokenBaseline, [collectionId]: { ...(s.brokenBaseline[collectionId] ?? {}), [model]: broken } },
          results: { ...s.results, [collectionId]: col },
        };
      });
    } catch (e) {
      if (activeRun === myRun) set((s) => ({ error: s.error ?? formatIpcError(e) }));
    } finally {
      unlisten?.();
      if (activeRun === myRun) set({ running: false, runningModel: null });
    }
  },

  stop: () => {
    activeRun++; // invalidate the in-flight run (the awaited result is ignored)
    // Actually cancel the backend probe — without this the model kept being called
    // through the whole ladder; bumping activeRun only hid the result in the UI.
    void stopContextCliff().catch((e) => console.error("stop context-cliff failed:", e));
    set({ running: false, runningModel: null });
  },

  reset: () => {
    activeRun++;
    // Reset abandons any in-flight run too — cancel the backend so it doesn't keep
    // calling the model. Only when actually running, so idle selection-change resets
    // don't fire a spurious IPC.
    if (get().running) {
      void stopContextCliff().catch((e) => console.error("stop context-cliff failed:", e));
    }
    set({ points: [], error: null, running: false, runningModel: null, progress: { done: 0, total: 0 } });
  },
}));
