import { create } from "zustand";
import { getUserSettings, setUserSettings } from "../../../shared/ipc/settings/userSettings";

interface OnboardingState {
  complete: boolean | null; // null until loaded
  load: () => Promise<void>;
  finish: () => Promise<void>;
}

/// Tracks the first-run gate (user_settings.first_run_complete). Fails
/// "open" (complete=true) if settings can't load, so a backend hiccup
/// never traps the user behind the coach.
export const useOnboardingStore = create<OnboardingState>((set) => ({
  complete: null,
  load: async () => {
    try {
      const s = await getUserSettings();
      set({ complete: s.first_run_complete });
    } catch {
      set({ complete: true });
    }
  },
  finish: async () => {
    set({ complete: true });
    try {
      const s = await getUserSettings();
      await setUserSettings({ ...s, first_run_complete: true });
    } catch (e) {
      console.error("onboarding finish persist failed:", e);
    }
  },
}));
