import { create } from "zustand";
import { historyClear, historyList, type HistoryEntry } from "../../../shared/ipc/workspace/history";

export interface HistoryStoreState {
  open: boolean;
  entries: HistoryEntry[];
  toggle: () => void;
  setOpen: (v: boolean) => void;
  load: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useHistoryStore = create<HistoryStoreState>((set) => ({
  open: false,
  entries: [],
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
  load: async () => {
    const entries = await historyList();
    set({ entries });
  },
  clear: async () => {
    await historyClear();
    set({ entries: [] });
  },
}));
