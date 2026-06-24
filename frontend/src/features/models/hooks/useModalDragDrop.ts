import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useModelStore } from "../state/modelStore";

/// While `active` is true, listen for OS-level drag-drop events on the
/// webview. Filters for `.gguf` and imports the first match. Multi-
/// file drops and non-.gguf drops emit a console message so they're
/// at least diagnosable from devtools.
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
          const paths = e.payload.paths;
          const ggufs = paths.filter((p) => p.toLowerCase().endsWith(".gguf"));
          if (ggufs.length === 0) {
            console.warn(
              `useModalDragDrop: drop ignored — no .gguf in ${paths.length} file(s):`,
              paths,
            );
            return;
          }
          if (ggufs.length > 1) {
            console.info(
              `useModalDragDrop: multiple .gguf dropped (${ggufs.length}); importing the first. Extras:`,
              ggufs.slice(1),
            );
          }
          setPendingLocalPath(ggufs[0]);
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
