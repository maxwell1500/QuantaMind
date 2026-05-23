import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  IDLE,
  type ModelInstallState,
} from "../state/install_state";
import { formatIpcError } from "../../../shared/ipc/error";
import { useModelStore } from "../state/modelStore";
import { startDownloadEventBus } from "../state/downloadEventBus";

export function useModelInstall(modelName?: string) {
  const [local, setLocal] = useState<ModelInstallState>(IDLE);
  const pullIdRef = useRef<string | null>(null);
  const nameRef = useRef<string | null>(modelName ?? null);
  const entry = useModelStore((s) => (nameRef.current ? s.downloads[nameRef.current] : null));
  const upsert = useModelStore((s) => s.upsertDownload);
  const recordPullName = useModelStore((s) => s.recordPullName);
  const removePullName = useModelStore((s) => s.removePullName);

  useEffect(() => { void startDownloadEventBus(); }, []);

  const state: ModelInstallState = entry
    ? {
        status: entry.status === "downloading" ? "pulling"
          : entry.status === "success" ? "success"
          : entry.status === "error" ? "error"
          : entry.status === "cancelled" ? "cancelled"
          : "idle",
        phase: entry.status === "downloading" ? "downloading" : null,
        progress: entry.bytesTotal !== undefined ? {
          bytesCompleted: entry.bytesCompleted ?? 0,
          bytesTotal: entry.bytesTotal,
          speedBps: 0,
          percentComplete: entry.percent,
          etaSeconds: 0,
        } : undefined,
        error: entry.error ?? undefined,
      }
    : local;

  const install = useCallback(async (name: string) => {
    nameRef.current = name;
    setLocal({ status: "pulling", phase: null });
    upsert({ id: name, source: "ollama", name, status: "downloading", percent: 0 });
    try {
      const pullId = await invoke<string>("pull_model", { name });
      pullIdRef.current = pullId;
      recordPullName(pullId, name);
      // Don't blindly overwrite — by the time invoke returns the bus may have
      // already written a Failed event (connection-refused is fast). Merge
      // pullId into whatever entry exists.
      const current = useModelStore.getState().downloads[name];
      if (current) upsert({ ...current, pullId });
    } catch (e) {
      const msg = formatIpcError(e);
      setLocal({ status: "error", phase: null, error: msg });
      upsert({ id: name, source: "ollama", name, status: "error", percent: 0, error: msg });
    }
  }, [upsert, recordPullName]);

  const cancel = useCallback(async () => {
    const pid = pullIdRef.current;
    if (!pid) return;
    try { await invoke("cancel_pull", { pullId: pid }); } catch { /* best-effort */ }
    removePullName(pid);
    pullIdRef.current = null;
    const name = nameRef.current;
    if (name) upsert({ id: name, source: "ollama", name, status: "cancelled", percent: 0 });
  }, [upsert, removePullName]);

  return { state, install, cancel };
}
