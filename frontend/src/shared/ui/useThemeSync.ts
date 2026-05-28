import { useEffect } from "react";
import { applyTheme, useThemeStore } from "../state/themeStore";

/// Mount once (App): load the persisted theme, then re-apply on OS
/// light/dark changes while the user is in "system" mode.
export function useThemeSync() {
  const mode = useThemeStore((s) => s.mode);
  const load = useThemeStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
}
