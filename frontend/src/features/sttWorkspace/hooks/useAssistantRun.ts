import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  EVENT_TOKEN,
  EVENT_DONE,
  EVENT_CANCELLED,
  TokenPayloadSchema,
} from "../../../shared/ipc/events/events";
import { useBackendStore } from "../../../shared/state/backendStore";
import { formatIpcError } from "../../../shared/ipc/core/error";

export type AssistantStatus = "idle" | "running" | "done" | "cancelled" | "error";

/// Run the transcribed audio through the selected LLM, with the user's optional
/// typed prompt as the system/context (voice → assistant). A purpose-built,
/// STT-local wrapper over the **shared** `run_prompt` event stream — deliberately
/// without the Workspace run's history/leak/compare side effects (those are
/// Workspace concerns; importing its hook would cross the feature boundary). Safe
/// because in STT mode the Workspace renders only `SttWorkspace`, so no other
/// `run_prompt` listener is mounted.
export function useAssistantRun() {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    void (async () => {
      const subs = await Promise.all([
        listen<unknown>(EVENT_TOKEN, (e) => {
          const p = TokenPayloadSchema.safeParse(e.payload);
          if (p.success) setOutput((prev) => prev + p.data.text);
        }),
        listen<unknown>(EVENT_DONE, () => setStatus((s) => (s === "running" ? "done" : s))),
        listen<unknown>(EVENT_CANCELLED, () => setStatus((s) => (s === "running" ? "cancelled" : s))),
      ]);
      if (cancelled) {
        subs.forEach((u) => u());
        return;
      }
      unsubs.push(...subs);
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  const run = useCallback(async (model: string, prompt: string, system?: string) => {
    setOutput("");
    setError(null);
    setStatus("running");
    try {
      const args: Record<string, unknown> = {
        model,
        prompt,
        backend: useBackendStore.getState().selectedBackend,
      };
      const trimmed = system?.trim();
      if (trimmed) args.system = trimmed;
      await invoke("run_prompt", args);
    } catch (e) {
      setError(formatIpcError(e));
      setStatus("error");
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await invoke("stop_prompt");
    } catch {
      /* best-effort: the backend may have already finished */
    }
  }, []);

  return { output, status, error, run, stop };
}
