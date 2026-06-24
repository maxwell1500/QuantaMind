import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  listSttCatalog,
  listInstalledSttModels,
  type SttCatalogEntry,
  type InstalledSttModel,
} from "../../../shared/ipc/stt/stt";

/// The curated catalog + which models are installed (validated ggml + VAD).
/// `refresh` is called after an install or a server start so the "installed"
/// state stays current.
export function useSttCatalog() {
  const [catalog, setCatalog] = useState<SttCatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledSttModel[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([listSttCatalog(), listInstalledSttModels()]);
      setCatalog(c);
      setInstalled(i);
    } catch {
      // IPC unavailable (e.g. very early boot / a non-Tauri context) — keep
      // current state rather than throwing an unhandled rejection.
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Refresh when a model lands (the STT install emits models-changed) so the
    // header dropdown picks up a newly-downloaded model without a reload.
    const un = listen("models-changed", () => void refresh());
    return () => {
      void un.then((f) => f());
    };
  }, [refresh]);

  const installedIds = new Set(installed.map((m) => m.id));
  return { catalog, installed, installedIds, refresh };
}
