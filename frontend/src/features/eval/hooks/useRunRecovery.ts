import { useCallback, useEffect, useState } from "react";
import { checkUnfinishedRun, discardRun, resumeBatchEval, type UnfinishedRun } from "../../../shared/ipc/eval/queue";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useBatchStore } from "../state/batchStore";

/// Crash recovery: on mount, ask the backend whether a run was interrupted. If so,
/// surface it for a Resume/Discard prompt. Resume drives the normal batch events
/// (the backend bulk-paints the Matrix then streams the live tail); Discard drops
/// the recovery log. Dismiss keeps the log for next launch.
export function useRunRecovery() {
  const [pending, setPending] = useState<UnfinishedRun | null>(null);

  useEffect(() => {
    // Best-effort — never block the Eval page on a recovery check.
    void checkUnfinishedRun()
      .then((r) => {
        if (r && !useBatchStore.getState().running) setPending(r);
      })
      .catch((e) => console.error("run-recovery check failed:", e));
  }, []);

  const resume = useCallback(async () => {
    if (!pending) return;
    const runId = pending.run_id;
    setPending(null);
    useBatchStore.getState().startRun();
    try {
      // Events (partial + live tail) drive the store; await settles on the final report.
      await resumeBatchEval(runId);
    } catch (e) {
      useBatchStore.getState().setError(formatIpcError(e));
    }
  }, [pending]);

  const discard = useCallback(async () => {
    if (!pending) return;
    const runId = pending.run_id;
    setPending(null);
    try {
      await discardRun(runId);
    } catch {
      /* a failed discard just leaves the log — it'll prompt again next launch */
    }
  }, [pending]);

  const dismiss = useCallback(() => setPending(null), []);

  return { pending, resume, discard, dismiss };
}
