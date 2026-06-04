import { create } from "zustand";
import type { DonePayload } from "../../../shared/ipc/events/events";

// The last run's final metrics — shared so the StatusBar can show them after a
// run completes (the run hook writes here on Done). Backend selection + server
// health moved to shared/state/backendStore (architecture.md rule 7). Per-action
// state lives in hooks. See architecture.md rule 6.
export interface WorkspaceStore {
  lastRunMetrics: DonePayload | null;
  setLastRunMetrics: (m: DonePayload) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  lastRunMetrics: null,
  setLastRunMetrics: (m) => set({ lastRunMetrics: m }),
}));
