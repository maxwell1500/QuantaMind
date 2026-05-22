import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useModelStore } from "../state/modelStore";

/// While `active` is true, listen for OS-level drag-drop events on the
/// webview. If a `.gguf` is dropped, switch to the Local tab and stash
/// the path in `modelStore.pendingLocalPath` so LocalFileTab picks it
/// up on mount.
export function useModalDragDrop(active: boolean) {
  const setActiveTab = useModelStore((s) => s.setActiveTab);
  const setPendingLocalPath = useModelStore((s) => s.setPendingLocalPath);

  useEffect(() => {
    if (!active) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const u = await getCurrentWebview().onDragDropEvent((e) => {
          if (e.payload.type !== "drop") return;
          const gguf = e.payload.paths.find((p) => p.toLowerCase().endsWith(".gguf"));
          if (!gguf) return;
          setPendingLocalPath(gguf);
          setActiveTab("local");
        });
        if (cancelled) u(); else unsub = u;
      } catch {
        // best-effort: drag-drop unavailable in tests / non-Tauri envs
      }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [active, setActiveTab, setPendingLocalPath]);
}
