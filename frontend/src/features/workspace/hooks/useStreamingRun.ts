import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  EVENT_DONE,
  EVENT_TOKEN,
  type DonePayload,
  type TokenPayload,
} from "../../../shared/ipc/events";
import { withTimeout } from "../../../shared/ipc/timeout";
import { useWorkspaceStore } from "../state/workspaceStore";

export type RunStatus = "idle" | "running" | "done" | "error";

export const RUN_PROMPT_TIMEOUT_MS = 30_000;
export const STOP_PROMPT_TIMEOUT_MS = 5_000;

export function useStreamingRun() {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DonePayload | null>(null);

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
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  const start = useCallback(async (model: string, prompt: string) => {
    setOutput("");
    setMetrics(null);
    setError(null);
    setStatus("running");
    try {
      await withTimeout(
        invoke("run_prompt", { model, prompt }),
        RUN_PROMPT_TIMEOUT_MS,
        "run_prompt",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  const cancel = useCallback(async () => {
    try {
      await withTimeout(
        invoke("stop_prompt"),
        STOP_PROMPT_TIMEOUT_MS,
        "stop_prompt",
      );
    } catch {
      // best-effort: backend may have already finished, or timed out
    }
  }, []);

  return { output, status, error, metrics, start, cancel };
}
