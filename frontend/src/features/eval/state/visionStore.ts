import { create } from "zustand";
import { runVisionEval, type VisionReport } from "../../../shared/ipc/eval/vision";

/// Holds the vision OCR run — entirely independent of the agentic batch store, so a vision result is
/// never mixed with (or averaged into) the tool-calling tiers.
interface VisionStore {
  report: VisionReport | null;
  running: boolean;
  error: string | null;
  run: (collectionId: string, model: string) => Promise<void>;
  reset: () => void;
}

export const useVisionStore = create<VisionStore>((set) => ({
  report: null,
  running: false,
  error: null,
  run: async (collectionId, model) => {
    set({ running: true, error: null });
    try {
      set({ report: await runVisionEval(collectionId, model), running: false });
    } catch (e) {
      set({ running: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
  reset: () => set({ report: null, error: null }),
}));
