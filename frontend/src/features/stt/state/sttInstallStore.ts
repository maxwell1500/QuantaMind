import { create } from "zustand";

export type SttInstallStatus = "idle" | "downloading" | "done" | "error";

/// One-at-a-time STT install state (the backend allows a single install in
/// flight). The whisper model + shared VAD are one user-facing operation.
interface SttInstallStore {
  status: SttInstallStatus;
  modelId: string | null;
  file: string | null;
  percent: number;
  error: string | null;
  begin: (id: string) => void;
  progress: (file: string, percent: number) => void;
  finish: () => void;
  fail: (msg: string) => void;
  reset: () => void;
}

export const useSttInstallStore = create<SttInstallStore>((set) => ({
  status: "idle",
  modelId: null,
  file: null,
  percent: 0,
  error: null,
  begin: (id) => set({ status: "downloading", modelId: id, file: null, percent: 0, error: null }),
  progress: (file, percent) => set({ status: "downloading", file, percent }),
  finish: () => set({ status: "done", percent: 100 }),
  fail: (msg) => set({ status: "error", error: msg }),
  reset: () => set({ status: "idle", modelId: null, file: null, percent: 0, error: null }),
}));
