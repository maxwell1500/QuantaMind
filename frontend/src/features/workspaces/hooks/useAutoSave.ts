import { useEffect, useRef } from "react";
import { useWorkspacesStore } from "../state/workspaceStore";

const DEBOUNCE_MS = 500;

/// Mount once per app. Saves the current prompt 500ms after the last
/// `dirty` change. A race-guard token discards stale saves if the
/// selection changes mid-save.
export function useAutoSave() {
  const dirty = useWorkspacesStore((s) => s.dirty);
  const path = useWorkspacesStore((s) => s.currentPath);
  const save = useWorkspacesStore((s) => s.save);
  const seq = useRef(0);

  useEffect(() => {
    if (!dirty || !path) return;
    const me = ++seq.current;
    const t = setTimeout(() => {
      if (seq.current !== me) return;
      save().catch((e) => console.error("auto-save failed:", e));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [dirty, path, save]);
}
