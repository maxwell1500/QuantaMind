import { useCallback, useEffect, useState } from "react";
import { cancelHfInstall, type HfPhase } from "../../../shared/ipc/models/hf_install";
import { installMlxModel } from "../../../shared/ipc/models/mlx";
import { friendlyInstallError } from "../../../shared/install_error";
import { useModelStore } from "../state/modelStore";
import { useInstalledModelsStore } from "../state/installedModelsStore";
import { startDownloadEventBus } from "../state/downloadEventBus";

export type MlxStatus = "idle" | "downloading" | "success" | "error";

export interface MlxInstallState {
  status: MlxStatus;
  phase: HfPhase | null;
  percent: number;
  error: string | null;
}

const IDLE: MlxInstallState = { status: "idle", phase: null, percent: 0, error: null };

/// Snapshot-download an MLX repo to local disk. Mirrors useHfInstall: progress
/// rides the shared download-event bus (keyed on the repo as activeHfName), and
/// the in-flight slot is shared with GGUF installs (one at a time).
export function useMlxInstall() {
  const [local, setLocal] = useState<MlxInstallState>(IDLE);
  const activeName = useModelStore((s) => s.activeHfName);
  const entry = useModelStore((s) => (activeName ? s.downloads[activeName] : null));
  const setActiveHfName = useModelStore((s) => s.setActiveHfName);
  const upsertDownload = useModelStore((s) => s.upsertDownload);

  useEffect(() => { void startDownloadEventBus(); }, []);

  const state: MlxInstallState = entry
    ? {
        status: entry.status === "downloading" || entry.status === "installing"
          ? "downloading"
          : entry.status === "success" ? "success"
          : entry.status === "error" ? "error" : "idle",
        phase: null,
        percent: entry.percent,
        error: entry.error ?? null,
      }
    : local;

  const install = useCallback(async (repo: string) => {
    // One install at a time (shared backend token); refuse rather than clobber
    // another in-flight download's event routing.
    const store = useModelStore.getState();
    if (store.activeHfName && store.activeHfName !== repo) {
      const cur = store.downloads[store.activeHfName];
      if (cur && (cur.status === "downloading" || cur.status === "installing")) {
        const msg = `Another download is in progress (${store.activeHfName}). Cancel it first.`;
        upsertDownload({ id: repo, source: "huggingface", name: repo, status: "error", percent: 0, error: msg });
        return;
      }
    }
    setActiveHfName(repo);
    upsertDownload({ id: repo, source: "huggingface", name: repo, status: "downloading", percent: 0 });
    try {
      await installMlxModel(repo);
      upsertDownload({ id: repo, source: "huggingface", name: repo, status: "success", percent: 100 });
      void useInstalledModelsStore.getState().refresh();
    } catch (e) {
      upsertDownload({ id: repo, source: "huggingface", name: repo, status: "error", percent: 0, error: friendlyInstallError(e) });
    }
  }, [setActiveHfName, upsertDownload]);

  const reset = useCallback(() => {
    setLocal(IDLE);
    setActiveHfName(null);
  }, [setActiveHfName]);

  const cancel = useCallback(async () => {
    try { await cancelHfInstall(); } catch { /* best-effort */ }
    const n = useModelStore.getState().activeHfName;
    if (n) upsertDownload({ id: n, source: "huggingface", name: n, status: "cancelled", percent: 0 });
  }, [upsertDownload]);

  return { state, install, cancel, reset };
}
