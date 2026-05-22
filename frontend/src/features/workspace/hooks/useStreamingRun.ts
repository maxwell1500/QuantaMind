import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  CancelledPayloadSchema,
  DonePayloadSchema,
  EVENT_CANCELLED,
  EVENT_DONE,
  EVENT_TOKEN,
  TokenPayloadSchema,
  type CancelledPayload,
  type DonePayload,
} from "../../../shared/ipc/events";
import { withTimeout } from "../../../shared/ipc/timeout";
import { useWorkspaceStore } from "../state/workspaceStore";

export type RunStatus = "idle" | "running" | "done" | "cancelled" | "error";

export const RUN_PROMPT_TIMEOUT_MS = 30_000;
export const STOP_PROMPT_TIMEOUT_MS = 5_000;

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
    const reject = (label: string, issues: unknown) => {
      console.error(`invalid ${label} payload`, issues);
      setError("invalid backend payload");
      setStatus("error");
    };
    (async () => {
      const ut = await listen<unknown>(EVENT_TOKEN, (e) => {
        const p = TokenPayloadSchema.safeParse(e.payload);
        if (!p.success) return reject("prompt-token", p.error.issues);
        setOutput((prev) => prev + p.data.text);
      });
      if (cancelled) { ut(); return; }
      unsubs.push(ut);

      const ud = await listen<unknown>(EVENT_DONE, (e) => {
        const p = DonePayloadSchema.safeParse(e.payload);
        if (!p.success) return reject("prompt-done", p.error.issues);
        setMetrics(p.data);
        setStatus("done");
        useWorkspaceStore.getState().setLastRunMetrics(p.data);
      });
      if (cancelled) { ud(); return; }
      unsubs.push(ud);

      const uc = await listen<unknown>(EVENT_CANCELLED, (e) => {
        const p = CancelledPayloadSchema.safeParse(e.payload);
        if (!p.success) return reject("prompt-cancelled", p.error.issues);
        setCancelledInfo(p.data);
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

  return { output, status, error, metrics, cancelledInfo, start, cancel };
}
