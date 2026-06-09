import { useCallback, useEffect, useState } from "react";
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
    const [c, i] = await Promise.all([listSttCatalog(), listInstalledSttModels()]);
    setCatalog(c);
    setInstalled(i);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const installedIds = new Set(installed.map((m) => m.id));
  return { catalog, installed, installedIds, refresh };
}
