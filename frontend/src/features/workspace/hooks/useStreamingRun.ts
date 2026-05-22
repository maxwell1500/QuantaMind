import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DonePayloadSchema,
  EVENT_DONE,
  EVENT_TOKEN,
  TokenPayloadSchema,
  type DonePayload,
} from "../../../shared/ipc/events";
import { useWorkspaceStore } from "../state/workspaceStore";

export type RunStatus = "idle" | "running" | "done" | "error";

export function useStreamingRun() {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DonePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    (async () => {
      const ut = await listen<unknown>(EVENT_TOKEN, (e) => {
        const parsed = TokenPayloadSchema.safeParse(e.payload);
        if (!parsed.success) {
          console.error("invalid prompt-token payload", parsed.error.issues);
          setError("invalid backend payload");
          setStatus("error");
          return;
        }
        setOutput((prev) => prev + parsed.data.text);
      });
      if (cancelled) { ut(); return; }
      unsubs.push(ut);

      const ud = await listen<unknown>(EVENT_DONE, (e) => {
        const parsed = DonePayloadSchema.safeParse(e.payload);
        if (!parsed.success) {
          console.error("invalid prompt-done payload", parsed.error.issues);
          setError("invalid backend payload");
          setStatus("error");
          return;
        }
        setMetrics(parsed.data);
        setStatus("done");
        useWorkspaceStore.getState().setLastRunMetrics(parsed.data);
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

  return { output, status, error, metrics, start, cancel };
}
