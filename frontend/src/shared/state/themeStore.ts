import { create } from "zustand";
import { getUserSettings, setUserSettings } from "../ipc/userSettings";

export type ThemeMode = "system" | "light" | "dark";

function prefersDark(): boolean {
  return typeof window !== "undefined"
    && !!window.matchMedia
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (prefersDark() ? "dark" : "light") : mode;
}

/// Set the resolved theme on <html data-theme>; tokens.css keys off it.
export function applyTheme(mode: ThemeMode): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolveTheme(mode);
  }
}

interface ThemeState {
  mode: ThemeMode;
  load: () => Promise<void>;
  setMode: (m: ThemeMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "system",
  load: async () => {
    try {
      const s = await getUserSettings();
      const m = (s.theme as ThemeMode) ?? "system";
      set({ mode: m });
      applyTheme(m);
    } catch {
      applyTheme("system");
    }
  },
  setMode: async (m) => {
    set({ mode: m });
    applyTheme(m);
    try {
      const s = await getUserSettings();
      await setUserSettings({ ...s, theme: m });
    } catch (e) {
      console.error("theme persist failed:", e);
    }
  },
}));
