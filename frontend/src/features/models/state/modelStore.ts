import { create } from "zustand";
import { z } from "zod";

export const TabIdSchema = z.enum(["ollama", "huggingface", "local", "storage"]);
export type TabId = z.infer<typeof TabIdSchema>;

export interface InstallInFlight {
  source: string;
  name: string;
  progress: number;
}

export interface ModelStore {
  activeTab: TabId;
  installInFlight: InstallInFlight | null;
  pendingLocalPath: string | null;
  setActiveTab: (t: TabId) => void;
  setInstallInFlight: (i: InstallInFlight | null) => void;
  setPendingLocalPath: (p: string | null) => void;
}

export const useModelStore = create<ModelStore>((set) => ({
  activeTab: "ollama",
  installInFlight: null,
  pendingLocalPath: null,
  setActiveTab: (t) => set({ activeTab: t }),
  setInstallInFlight: (i) => set({ installInFlight: i }),
  setPendingLocalPath: (p) => set({ pendingLocalPath: p }),
}));
