import { create } from "zustand";

export interface UiStoreState {
  sidebarVisible: boolean;
  cheatsheetOpen: boolean;
  creatingPrompt: boolean;
  toggleSidebar: () => void;
  toggleCheatsheet: () => void;
  setCheatsheetOpen: (v: boolean) => void;
  setCreatingPrompt: (v: boolean) => void;
}

/// Cross-cutting UI panel visibility driven by keyboard shortcuts and
/// header buttons. The Workspace's single left rail (folder + backends +
/// files) toggles via `sidebarVisible`. Panels that own their own data
/// (History) keep their own store; this holds the lightweight toggles.
export const useUiStore = create<UiStoreState>((set) => ({
  sidebarVisible: true,
  cheatsheetOpen: false,
  creatingPrompt: false,
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  toggleCheatsheet: () => set((s) => ({ cheatsheetOpen: !s.cheatsheetOpen })),
  setCheatsheetOpen: (cheatsheetOpen) => set({ cheatsheetOpen }),
  setCreatingPrompt: (creatingPrompt) => set({ creatingPrompt }),
}));
