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

export function useModelInstall() {
  const [state, setState] = useState<ModelInstallState>(IDLE);
  const pullIdRef = useRef<string | null>(null);

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
        setState((s) => applyProgress(s, p.data.progress));
      });
      if (cancelled) { u(); return; }
      unsub = u;
    })();
    return () => {
      cancelled = true;
      if (pullIdRef.current) {
        invoke("cancel_pull", { pullId: pullIdRef.current }).catch(() => {});
        pullIdRef.current = null;
      }
      unsub?.();
    };
  }, []);

  const install = useCallback(async (name: string) => {
    setState({ status: "pulling", phase: null });
    try {
      const pullId = await invoke<string>("pull_model", { name });
      pullIdRef.current = pullId;
    } catch (e) {
      pullIdRef.current = null;
      setState({
        status: "error",
        phase: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, []);

  const cancel = useCallback(async () => {
    const pid = pullIdRef.current;
    if (!pid) return;
    try {
      await invoke("cancel_pull", { pullId: pid });
    } catch {
      // best-effort
    }
    pullIdRef.current = null;
    setState((s) => ({ ...s, status: "cancelled", phase: null }));
  }, []);

  return { state, install, cancel };
}
