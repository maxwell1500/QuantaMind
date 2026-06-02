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
  mlxHealthy: boolean | null;
  activeBackend: BackendKind;
  // HF repo id to prefill the "Start MLX" control — set when the user picks an
  // MLX repo from HuggingFace search, then routes to the workspace.
  mlxRepo: string | null;
  setLastRunMetrics: (m: DonePayload) => void;
  setOllamaHealthy: (h: boolean) => void;
  setLlamaHealthy: (h: boolean) => void;
  setMlxHealthy: (h: boolean) => void;
  setActiveBackend: (b: BackendKind) => void;
  setMlxRepo: (repo: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  lastRunMetrics: null,
  ollamaHealthy: null,
  llamaHealthy: null,
  mlxHealthy: null,
  activeBackend: "ollama",
  mlxRepo: null,
  setLastRunMetrics: (m) => set({ lastRunMetrics: m }),
  setOllamaHealthy: (h) => set({ ollamaHealthy: h }),
  setLlamaHealthy: (h) => set({ llamaHealthy: h }),
  setMlxHealthy: (h) => set({ mlxHealthy: h }),
  setActiveBackend: (b) => set({ activeBackend: b }),
  setMlxRepo: (repo) => set({ mlxRepo: repo }),
}));
