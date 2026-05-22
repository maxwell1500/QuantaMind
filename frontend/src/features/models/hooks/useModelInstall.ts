import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  EVENT_PULL_PROGRESS,
  PullProgressEventSchema,
} from "../../../shared/ipc/pull_events";
import {
  applyProgress,
  IDLE,
  type ModelInstallState,
} from "../state/install_state";
import { formatIpcError } from "../../../shared/ipc/error";
import { useModelStore, type DownloadStatus } from "../state/modelStore";

const statusOf = (s: ModelInstallState): DownloadStatus =>
  s.status === "success" ? "success"
  : s.status === "error" ? "error"
  : s.status === "cancelled" ? "cancelled"
  : "downloading";

export function useModelInstall() {
  const [state, setState] = useState<ModelInstallState>(IDLE);
  const pullIdRef = useRef<string | null>(null);
  const nameRef = useRef<string | null>(null);
  const upsert = useModelStore((s) => s.upsertDownload);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const u = await listen<unknown>(EVENT_PULL_PROGRESS, (e) => {
        const p = PullProgressEventSchema.safeParse(e.payload);
        if (!p.success) {
          console.error("invalid pull-progress payload", p.error.issues);
          return;
        }
        if (p.data.pull_id !== pullIdRef.current) return;
        setState((s) => {
          const next = applyProgress(s, p.data.progress);
          const name = nameRef.current;
          if (name) upsert({
            id: name, source: "ollama", name,
            status: statusOf(next),
            percent: Math.round(next.progress?.percentComplete ?? (next.status === "success" ? 100 : 0)),
            bytesCompleted: next.progress?.bytesCompleted,
            bytesTotal: next.progress?.bytesTotal,
          });
          return next;
        });
      });
      if (cancelled) { u(); return; } else unsub = u;
    })();
    return () => { cancelled = true; unsub?.(); };
  }, [upsert]);

  const install = useCallback(async (name: string) => {
    nameRef.current = name;
    setState({ status: "pulling", phase: null });
    upsert({ id: name, source: "ollama", name, status: "downloading", percent: 0 });
    try {
      const pullId = await invoke<string>("pull_model", { name });
      pullIdRef.current = pullId;
      upsert({ id: name, source: "ollama", name, status: "downloading", percent: 0, pullId });
    } catch (e) {
      pullIdRef.current = null;
      const msg = formatIpcError(e);
      setState({ status: "error", phase: null, error: msg });
      upsert({ id: name, source: "ollama", name, status: "error", percent: 0, error: msg });
    }
  }, [upsert]);

  const cancel = useCallback(async () => {
    const pid = pullIdRef.current;
    if (!pid) return;
    try { await invoke("cancel_pull", { pullId: pid }); } catch { /* best-effort */ }
    pullIdRef.current = null;
    const name = nameRef.current;
    setState((s) => ({ ...s, status: "cancelled", phase: null }));
    if (name) upsert({ id: name, source: "ollama", name, status: "cancelled", percent: 0 });
  }, [upsert]);

  return { state, install, cancel };
}
