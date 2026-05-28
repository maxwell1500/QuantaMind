import { create } from "zustand";
import {
  getInstalledModelsWithStats,
  type InstalledModelInfo,
} from "../../../shared/ipc/models/storage";
import { formatIpcError } from "../../../shared/ipc/core/error";

export type InstalledStatus = "idle" | "loading" | "ready" | "error";

export interface InstalledModelsState {
  list: InstalledModelInfo[];
  status: InstalledStatus;
  error: string | null;
  lastRefreshedAt: number | null;
  refresh: () => Promise<void>;
  setList: (list: InstalledModelInfo[]) => void;
}

/// Single source of truth for the installed-models list. Install hooks
/// proactively call `refresh()` on success so consumers see the new
/// model even if the backend's `models-changed` broadcast event is
/// dropped (listener-registration race, /api/tags lag, etc.). The
/// centralized models-changed bus (see installedModelsBus.ts) also
/// drives this same `refresh()`.
export const useInstalledModelsStore = create<InstalledModelsState>(
  (set, get) => ({
    list: [],
    status: "idle",
    error: null,
    lastRefreshedAt: null,
    setList: (list) =>
      set({ list, status: "ready", error: null, lastRefreshedAt: Date.now() }),
    refresh: async () => {
      if (get().status === "loading") return;
      set({ status: "loading", error: null });
      try {
        const list = await getInstalledModelsWithStats();
        set({
          list,
          status: "ready",
          error: null,
          lastRefreshedAt: Date.now(),
        });
      } catch (e) {
        set({ status: "error", error: formatIpcError(e) });
      }
    },
  }),
);
