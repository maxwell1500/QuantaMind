import { useEffect, useRef } from "react";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useToast } from "../../../shared/ui/Toast";
import { formatIpcError } from "../../../shared/ipc/core/error";

const DEBOUNCE_MS = 500;

/// Mount once per app. Saves the current prompt 500ms after the last
/// `dirty` change. A race-guard token discards stale saves if the
/// selection changes mid-save. A failed save is surfaced via a toast —
/// silently dropping it would let the user believe their work is saved.
export function useAutoSave() {
  const dirty = useWorkspacesStore((s) => s.dirty);
  const path = useWorkspacesStore((s) => s.currentPath);
  const save = useWorkspacesStore((s) => s.save);
  const toast = useToast();
  const seq = useRef(0);

  useEffect(() => {
    if (!dirty || !path) return;
    const me = ++seq.current;
    const t = setTimeout(() => {
      if (seq.current !== me) return;
      save().catch((e) => {
        console.error("auto-save failed:", e);
        toast(`Auto-save failed: ${formatIpcError(e)}`);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [dirty, path, save, toast]);
}
