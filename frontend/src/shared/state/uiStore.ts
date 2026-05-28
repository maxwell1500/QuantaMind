import { create } from "zustand";

export interface UiStoreState {
  filesVisible: boolean;
  settingsOpen: boolean;
  cheatsheetOpen: boolean;
  creatingPrompt: boolean;
  toggleFiles: () => void;
  toggleSettings: () => void;
  toggleCheatsheet: () => void;
  setSettingsOpen: (v: boolean) => void;
  setCheatsheetOpen: (v: boolean) => void;
  setCreatingPrompt: (v: boolean) => void;
}

/// Cross-cutting UI panel visibility driven by keyboard shortcuts and
/// header buttons. Panels that own their own data (History) keep their
/// own store; this holds the lightweight toggles.
export const useUiStore = create<UiStoreState>((set) => ({
  filesVisible: true,
  settingsOpen: false,
  cheatsheetOpen: false,
  creatingPrompt: false,
  toggleFiles: () => set((s) => ({ filesVisible: !s.filesVisible })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  toggleCheatsheet: () => set((s) => ({ cheatsheetOpen: !s.cheatsheetOpen })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setCheatsheetOpen: (cheatsheetOpen) => set({ cheatsheetOpen }),
  setCreatingPrompt: (creatingPrompt) => set({ creatingPrompt }),
}));
