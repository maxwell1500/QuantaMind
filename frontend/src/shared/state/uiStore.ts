import { create } from "zustand";

export interface UiStoreState {
  filesVisible: boolean;
  backendPanelVisible: boolean;
  cheatsheetOpen: boolean;
  creatingPrompt: boolean;
  toggleFiles: () => void;
  toggleBackendPanel: () => void;
  toggleCheatsheet: () => void;
  setCheatsheetOpen: (v: boolean) => void;
  setCreatingPrompt: (v: boolean) => void;
}

/// Cross-cutting UI panel visibility driven by keyboard shortcuts and
/// header buttons. Panels that own their own data (History) keep their
/// own store; this holds the lightweight toggles.
export const useUiStore = create<UiStoreState>((set) => ({
  filesVisible: true,
  backendPanelVisible: true,
  cheatsheetOpen: false,
  creatingPrompt: false,
  toggleFiles: () => set((s) => ({ filesVisible: !s.filesVisible })),
  toggleBackendPanel: () => set((s) => ({ backendPanelVisible: !s.backendPanelVisible })),
  toggleCheatsheet: () => set((s) => ({ cheatsheetOpen: !s.cheatsheetOpen })),
  setCheatsheetOpen: (cheatsheetOpen) => set({ cheatsheetOpen }),
  setCreatingPrompt: (creatingPrompt) => set({ creatingPrompt }),
}));
