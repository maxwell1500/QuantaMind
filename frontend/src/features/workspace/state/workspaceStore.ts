import { create } from "zustand";

export type RunStatus = "idle" | "running" | "streaming" | "done";

export interface WorkspaceStore {
  status: RunStatus;
  beginRun: () => void;
  receiveToken: () => void;
  finish: () => void;
  cancel: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  status: "idle",
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
}));
