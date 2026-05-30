import { create } from "zustand";
import { ollamaRss } from "../../../shared/ipc/system/process_memory";

// Session-only series of Ollama process RSS, sampled at each run completion.
// Not persisted — the leak heuristic only spans the app's lifetime.
interface LeakStore {
  series: number[];
  sample: () => Promise<void>;
  reset: () => void;
}

export const useLeakStore = create<LeakStore>((set) => ({
  series: [],
  sample: async () => {
    const rss = await ollamaRss();
    if (rss == null) return;
    set((s) => ({ series: [...s.series, rss].slice(-30) }));
  },
  reset: () => set({ series: [] }),
}));
