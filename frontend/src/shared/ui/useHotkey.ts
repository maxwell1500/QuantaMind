import { useEffect, useRef } from "react";

/// Match a keyboard event against a combo like "mod+enter", "mod+shift+k",
/// or "mod+,". "mod" means Cmd or Ctrl (either, so it's cross-platform).
export function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const needMod = parts.includes("mod");
  const needShift = parts.includes("shift");
  const mod = e.metaKey || e.ctrlKey;
  if (needMod !== mod) return false;
  if (needShift !== e.shiftKey) return false;
  return e.key.toLowerCase() === key;
}

/// Register a global keyboard handler for one combo. `enabled` gates the
/// binding by scope (e.g. only when the workspace view is active). The
/// handler is held in a ref so callers needn't memoise it.
export function useHotkey(combo: string, handler: () => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (matchCombo(e, combo)) {
        e.preventDefault();
        ref.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [combo, enabled]);
}
