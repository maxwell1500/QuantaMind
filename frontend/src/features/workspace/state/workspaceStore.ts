import { create } from "zustand";
import type { DonePayload } from "../../../shared/ipc/events";

export type RunStatus = "idle" | "running" | "streaming" | "done";

export interface WorkspaceStore {
  status: RunStatus;
  lastRunMetrics: DonePayload | null;
  beginRun: () => void;
  receiveToken: () => void;
  finish: () => void;
  cancel: () => void;
  setLastRunMetrics: (m: DonePayload) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  status: "idle",
  lastRunMetrics: null,
  beginRun: () => set({ status: "running" }),
  receiveToken: () =>
    set((s) => (s.status === "running" ? { status: "streaming" } : s)),
  finish: () =>
    set((s) =>
      s.status === "running" || s.status === "streaming"
        ? { status: "done" }
        : s,
    ),
  cancel: () => set({ status: "idle" }),
  setLastRunMetrics: (m) => set({ lastRunMetrics: m }),
}));
