import { useCallback, useEffect } from "react";
import { downloadMlxSttModel } from "../../../shared/ipc/stt/mlxStt";
import { cancelSttInstall } from "../../../shared/ipc/stt/stt";
import { friendlyInstallError } from "../../../shared/install_error";
import { useModelStore } from "../../models/state/modelStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { startDownloadEventBus } from "../../models/state/downloadEventBus";

/// Download an MLX whisper snapshot, routed through the shared download store
/// (source "stt") + the shared STT install guard — so progress shows in the
/// Downloads page and `cancel_stt_install` cancels it. Mirrors useSttInstall.
export function useMlxSttInstall(onDone?: () => void) {
  const setActiveSttName = useModelStore((s) => s.setActiveSttName);
  const upsertDownload = useModelStore((s) => s.upsertDownload);

  useEffect(() => {
    void startDownloadEventBus();
  }, []);

  const install = useCallback(
    async (repo: string) => {
      setActiveSttName(repo);
      upsertDownload({ id: repo, source: "stt", name: repo, status: "downloading", percent: 0 });
      try {
        await downloadMlxSttModel(repo);
        upsertDownload({ id: repo, source: "stt", name: repo, status: "success", percent: 100 });
        void useInstalledModelsStore.getState().refresh();
        onDone?.();
      } catch (e) {
        upsertDownload({ id: repo, source: "stt", name: repo, status: "error", percent: 0, error: friendlyInstallError(e) });
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
