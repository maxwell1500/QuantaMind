import { create } from "zustand";
import type { DonePayload } from "../../../shared/ipc/events";

// Shared cross-component state only. Per-action/ephemeral state (run
// status, output buffer, install progress) lives in hooks. See
// architecture.md rule 6.
export interface WorkspaceStore {
  lastRunMetrics: DonePayload | null;
  ollamaHealthy: boolean | null;
  setLastRunMetrics: (m: DonePayload) => void;
  setOllamaHealthy: (h: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  lastRunMetrics: null,
  ollamaHealthy: null,
  setLastRunMetrics: (m) => set({ lastRunMetrics: m }),
  setOllamaHealthy: (h) => set({ ollamaHealthy: h }),
}));
