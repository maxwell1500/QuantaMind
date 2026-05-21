import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  EVENT_DONE,
  EVENT_TOKEN,
  type TokenPayload,
} from "../../../shared/ipc/events";

export type RunStatus = "idle" | "running" | "done" | "error";

export function useStreamingRun() {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    (async () => {
      const ut = await listen<TokenPayload>(EVENT_TOKEN, (e) => {
        setOutput((prev) => prev + e.payload.text);
      });
      if (cancelled) {
        ut();
        return;
      }
      unsubs.push(ut);

      const ud = await listen(EVENT_DONE, () => {
        setStatus("done");
      });
      if (cancelled) {
        ud();
        return;
      }
      unsubs.push(ud);
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  const start = useCallback(async (model: string, prompt: string) => {
    setOutput("");
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

  return { output, status, error, start, cancel };
}
