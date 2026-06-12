import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  listMlxSttCatalog,
  listInstalledMlxSttModels,
  type MlxSttCatalogEntry,
  type InstalledMlxSttModel,
} from "../../../shared/ipc/stt/mlxStt";

/// The MLX whisper catalog + which snapshots are installed. Refreshes on
/// `models-changed` (the download emits it) so a new model appears without a
/// reload. Degrades to empty if the IPC is unavailable.
export function useMlxSttCatalog() {
  const [catalog, setCatalog] = useState<MlxSttCatalogEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledMlxSttModel[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([listMlxSttCatalog(), listInstalledMlxSttModels()]);
      setCatalog(c);
      setInstalled(i);
    } catch {
      /* ipc unavailable — keep current state */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const un = listen("models-changed", () => void refresh());
    return () => {
      void un.then((f) => f());
    };
  }, [refresh]);

  const installedRepos = new Set(installed.map((m) => m.repo));
  return { catalog, installed, installedRepos, refresh };
}
