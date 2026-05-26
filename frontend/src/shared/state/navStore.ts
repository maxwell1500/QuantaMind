import { create } from "zustand";

/// Top-level view of the app. Each value corresponds to one of the five
/// top tabs in `App.tsx`. The store is the single source of truth so the
/// Workspace's "Add Model" button can navigate to the Models tab without
/// prop-drilling.

export type TopView =
  | "workspace"
  | "compare"
  | "models"
  | "downloads"
  | "storage"
  | "help";

interface NavStore {
  topView: TopView;
  setTopView: (v: TopView) => void;
}

export const useNavStore = create<NavStore>((set) => ({
  topView: "workspace",
  setTopView: (topView) => set({ topView }),
}));
