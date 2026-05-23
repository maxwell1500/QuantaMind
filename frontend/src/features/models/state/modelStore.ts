import { create } from "zustand";
import { z } from "zod";

export const TabIdSchema = z.enum([
  "ollama",
  "huggingface",
  "local",
  "downloads",
  "storage",
]);
export type TabId = z.infer<typeof TabIdSchema>;

export type DownloadStatus =
  | "downloading"
  | "installing"
  | "success"
  | "error"
  | "cancelled";
export type DownloadSource = "ollama" | "huggingface" | "local";

export interface DownloadEntry {
  id: string;
  source: DownloadSource;
  name: string;
  status: DownloadStatus;
  percent: number;
  bytesCompleted?: number;
  bytesTotal?: number;
  error?: string | null;
  pullId?: string;
}

export interface InstallInFlight {
  source: string;
  name: string;
  progress: number;
}

export interface ModelStore {
  activeTab: TabId;
  installInFlight: InstallInFlight | null;
  pendingLocalPath: string | null;
  downloads: Record<string, DownloadEntry>;
  activeHfName: string | null;
  pullNames: Record<string, string>;
  setActiveTab: (t: TabId) => void;
  setInstallInFlight: (i: InstallInFlight | null) => void;
  setPendingLocalPath: (p: string | null) => void;
  upsertDownload: (entry: DownloadEntry) => void;
  removeDownload: (id: string) => void;
  setActiveHfName: (n: string | null) => void;
  recordPullName: (pullId: string, name: string) => void;
  removePullName: (pullId: string) => void;
}

export const useModelStore = create<ModelStore>((set) => ({
  activeTab: "ollama",
  installInFlight: null,
  pendingLocalPath: null,
  downloads: {},
  activeHfName: null,
  pullNames: {},
  setActiveTab: (t) => set({ activeTab: t }),
  setInstallInFlight: (i) => set({ installInFlight: i }),
  setPendingLocalPath: (p) => set({ pendingLocalPath: p }),
  upsertDownload: (entry) =>
    set((s) => ({ downloads: { ...s.downloads, [entry.id]: entry } })),
  removeDownload: (id) =>
    set((s) => {
      const next = { ...s.downloads };
      delete next[id];
      return { downloads: next };
    }),
  setActiveHfName: (n) => set({ activeHfName: n }),
  recordPullName: (pullId, name) =>
    set((s) => ({ pullNames: { ...s.pullNames, [pullId]: name } })),
  removePullName: (pullId) =>
    set((s) => {
      const next = { ...s.pullNames };
      delete next[pullId];
      return { pullNames: next };
    }),
}));
