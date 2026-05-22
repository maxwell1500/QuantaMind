import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  EVENT_CANCELLED,
  EVENT_DONE,
  EVENT_TOKEN,
  type CancelledPayload,
  type DonePayload,
  type TokenPayload,
} from "../../../shared/ipc/events";
import { useWorkspaceStore } from "../state/workspaceStore";

export type RunStatus = "idle" | "running" | "done" | "cancelled" | "error";

export function useStreamingRun() {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DonePayload | null>(null);
  const [cancelledInfo, setCancelledInfo] =
    useState<CancelledPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    (async () => {
      const ut = await listen<TokenPayload>(EVENT_TOKEN, (e) => {
        setOutput((prev) => prev + e.payload.text);
      });
      if (cancelled) { ut(); return; }
      unsubs.push(ut);

      const ud = await listen<DonePayload>(EVENT_DONE, (e) => {
        setMetrics(e.payload);
        setStatus("done");
        useWorkspaceStore.getState().setLastRunMetrics(e.payload);
      });
      if (cancelled) { ud(); return; }
      unsubs.push(ud);

      const uc = await listen<CancelledPayload>(EVENT_CANCELLED, (e) => {
        setCancelledInfo(e.payload);
        setStatus("cancelled");
      });
      if (cancelled) { uc(); return; }
      unsubs.push(uc);
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  const start = useCallback(async (model: string, prompt: string) => {
    setOutput("");
    setMetrics(null);
    setCancelledInfo(null);
    setError(null);
    setStatus("running");
    try {
      await invoke("run_prompt", { model, prompt });
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }, []);

  const cancel = useCallback(async () => {
    try {
      await invoke("stop_prompt");
    } catch {
      // best-effort: backend may have already finished
    }
  }, []);

  return { output, status, error, metrics, cancelledInfo, start, cancel };
}
