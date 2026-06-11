import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  EVENT_TOKEN,
  EVENT_DONE,
  EVENT_CANCELLED,
  TokenPayloadSchema,
  DonePayloadSchema,
} from "../../../shared/ipc/events/events";
import { useBackendStore } from "../../../shared/state/backendStore";
import { useAssistantResultStore } from "../../sttInspector/state/assistantResultStore";
import { formatIpcError } from "../../../shared/ipc/core/error";

export type AssistantStatus = "idle" | "running" | "done" | "cancelled" | "error";

/// Which transcript this run summarizes, and whether the auto-pipe triggered it.
export interface RunCtx {
  transcriptId: string | null;
  auto: boolean;
}

/// Run the transcribed audio through the selected LLM, with the user's optional
/// typed prompt as the system/context (voice → assistant). On completion it
/// captures the **measured** LLM-stage metrics (TTFT, throughput, tokens, total +
/// wall) into the durable `assistantResultStore`, so the Analysis/Inspector can
/// render the full STT→LLM breakdown. A purpose-built, STT-local wrapper over the
/// shared `run_prompt` event stream (no Workspace history/compare side effects).
export function useAssistantRun() {
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Refs so the once-mounted EVENT_DONE listener sees the latest run's data.
  const outputRef = useRef("");
  const startRef = useRef(0);
  const metaRef = useRef<{ model: string; system: string | null; ctx: RunCtx } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    void (async () => {
      const subs = await Promise.all([
        listen<unknown>(EVENT_TOKEN, (e) => {
          const p = TokenPayloadSchema.safeParse(e.payload);
          if (p.success) {
            outputRef.current += p.data.text;
            setOutput(outputRef.current);
          }
        }),
        listen<unknown>(EVENT_DONE, (e) => {
          setStatus((s) => (s === "running" ? "done" : s));
          const meta = metaRef.current;
          if (!meta) return;
          const wallMs = performance.now() - startRef.current;
          const d = DonePayloadSchema.safeParse(e.payload);
          const done = d.success ? d.data : null;
          useAssistantResultStore.getState().setResult({
            transcriptId: meta.ctx.transcriptId,
            model: meta.model,
            system: meta.system,
            output: outputRef.current,
            ttftMs: done?.ttft_ms ?? null,
            tokensPerSec: done?.tokens_per_sec ?? null,
            tokenCount: done?.token_count ?? 0,
            totalMs: done?.stats?.total_ms ?? null,
            wallMs,
            auto: meta.ctx.auto,
          });
        }),
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

  const run = useCallback(async (model: string, prompt: string, system?: string, ctx?: RunCtx) => {
    setOutput("");
    outputRef.current = "";
    setError(null);
    setStatus("running");
    startRef.current = performance.now();
    const trimmedSystem = system?.trim() || null;
    metaRef.current = { model, system: trimmedSystem, ctx: ctx ?? { transcriptId: null, auto: false } };
    try {
      const args: Record<string, unknown> = {
        model,
        prompt,
        backend: useBackendStore.getState().selectedBackend,
      };
      if (trimmedSystem) args.system = trimmedSystem;
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
