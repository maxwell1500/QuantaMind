import { create } from "zustand";
import type { DonePayload } from "../../../shared/ipc/events/events";
import type { BackendKind } from "../../../shared/ipc/models/storage";

// Shared cross-component state only. Per-action/ephemeral state (run
// status, output buffer, install progress) lives in hooks. See
// architecture.md rule 6.
export interface WorkspaceStore {
  lastRunMetrics: DonePayload | null;
  ollamaHealthy: boolean | null;
  llamaHealthy: boolean | null;
  activeBackend: BackendKind;
  setLastRunMetrics: (m: DonePayload) => void;
  setOllamaHealthy: (h: boolean) => void;
  setLlamaHealthy: (h: boolean) => void;
  setActiveBackend: (b: BackendKind) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  lastRunMetrics: null,
  ollamaHealthy: null,
  llamaHealthy: null,
  activeBackend: "ollama",
  setLastRunMetrics: (m) => set({ lastRunMetrics: m }),
  setOllamaHealthy: (h) => set({ ollamaHealthy: h }),
  setLlamaHealthy: (h) => set({ llamaHealthy: h }),
  setActiveBackend: (b) => set({ activeBackend: b }),
}));
