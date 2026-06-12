import { useCallback, useEffect } from "react";
import { downloadSttModel, cancelSttInstall } from "../../../shared/ipc/stt/stt";
import { friendlyInstallError } from "../../../shared/install_error";
import { useModelStore } from "../../models/state/modelStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { startDownloadEventBus } from "../../models/state/downloadEventBus";

/// Download a whisper model + the shared VAD as one operation, routed through the
/// shared download store (source "stt") so progress shows in the Downloads page
/// alongside LLM downloads. Mirrors useMlxInstall. `onDone` refreshes the
/// installed list. Progress rides the shared download-event bus.
export function useSttInstall(onDone?: () => void) {
  const setActiveSttName = useModelStore((s) => s.setActiveSttName);
  const upsertDownload = useModelStore((s) => s.upsertDownload);

  useEffect(() => {
    void startDownloadEventBus();
  }, []);

  const install = useCallback(
    async (id: string) => {
      setActiveSttName(id);
      upsertDownload({ id, source: "stt", name: id, status: "downloading", percent: 0 });
      try {
        await downloadSttModel(id);
        upsertDownload({ id, source: "stt", name: id, status: "success", percent: 100 });
        void useInstalledModelsStore.getState().refresh();
        onDone?.();
      } catch (e) {
        upsertDownload({ id, source: "stt", name: id, status: "error", percent: 0, error: friendlyInstallError(e) });
      }
    },
    [setActiveSttName, upsertDownload, onDone],
  );

  const cancel = useCallback(async () => {
    try {
      await cancelSttInstall();
    } catch {
      /* best-effort */
    }
    const n = useModelStore.getState().activeSttName;
    if (n) upsertDownload({ id: n, source: "stt", name: n, status: "cancelled", percent: 0 });
  }, [upsertDownload]);

  return { install, cancel };
}
