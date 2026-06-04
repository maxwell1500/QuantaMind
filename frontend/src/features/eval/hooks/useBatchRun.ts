import { useCallback, useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  AgenticStepPayloadSchema,
  BatchCompletePayloadSchema,
  BatchProgressSchema,
  EVENT_AGENTIC_STEP,
  EVENT_BATCH_COMPLETE,
  EVENT_BATCH_PROGRESS,
  runBatchEval,
  stopBatchEval,
} from "../../../shared/ipc/eval/batch";
import { formatIpcError } from "../../../shared/ipc/core/error";
import type { ModelTarget } from "../../../shared/ipc/eval/matrix";
import type { ToolTask } from "../../../shared/ipc/eval/registry";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useBatchStore } from "../state/batchStore";
import { useParamsStore } from "../../../shared/state/paramsStore";

const modelSig = (list: { name: string }[]) =>
  list
    .map((m) => m.name)
    .sort()
    .join("|");

/// Drives one batch run over a single Tauri event stream. Subscribes ONCE to
/// `batch-progress` / `agentic-step` / `batch-complete`, routes each into the
/// rAF-buffered store, and flushes that store if the installed-model set changes
/// (so a stale trajectory never renders against the wrong model row).
export function useBatchRun() {
  useEffect(() => {
    const unlisten: UnlistenFn[] = [];
    let cancelled = false;
    void (async () => {
      const subs = await Promise.all([
        listen(EVENT_BATCH_PROGRESS, (e) => {
          const r = BatchProgressSchema.safeParse(e.payload);
          if (r.success) useBatchStore.getState().ingestProgress(r.data);
        }),
        listen(EVENT_AGENTIC_STEP, (e) => {
          const r = AgenticStepPayloadSchema.safeParse(e.payload);
          if (r.success) useBatchStore.getState().ingestStep(r.data);
        }),
        listen(EVENT_BATCH_COMPLETE, (e) => {
          const r = BatchCompletePayloadSchema.safeParse(e.payload);
          if (r.success) useBatchStore.getState().complete(r.data.report);
        }),
      ]);
      if (cancelled) {
        subs.forEach((u) => u());
        return;
      }
      unlisten.push(...subs);
    })();
    return () => {
      cancelled = true;
      unlisten.forEach((u) => u());
    };
  }, []);

  // Cache invalidation: when the installed-model set actually changes (a swap /
  // download), flush volatile traces — but never wipe a run in progress.
  useEffect(() => {
    let prev = modelSig(useInstalledModelsStore.getState().list);
    return useInstalledModelsStore.subscribe((s) => {
      const next = modelSig(s.list);
      if (next !== prev) {
        prev = next;
        if (!useBatchStore.getState().running) useBatchStore.getState().reset();
      }
    });
  }, []);

  const run = useCallback(
    async (collectionId: string, targets: ModelTarget[], tasks: ToolTask[], k?: number, maxSteps?: number) => {
      useBatchStore.getState().startRun();
      try {
        const { globalParams, keepLoaded } = useParamsStore.getState();
        // Keep loaded → resident; off → omit so the backend default applies.
        await runBatchEval(collectionId, targets, tasks, k, maxSteps, globalParams, keepLoaded ? -1 : undefined);
      } catch (e) {
        useBatchStore.getState().setError(formatIpcError(e));
      }
    },
    [],
  );

  const stop = useCallback(async () => {
    await stopBatchEval();
  }, []);

  return { run, stop };
}
