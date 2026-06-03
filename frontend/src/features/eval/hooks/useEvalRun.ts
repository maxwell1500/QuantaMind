import { useCallback } from "react";
import { runEvalTask } from "../../../shared/ipc/eval/evals";
import type { BackendKind } from "../../../shared/ipc/models/storage";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useEvalStore } from "../state/evalStore";

/// Run every loaded eval task sequentially against `model` on `backend`,
/// recording each result. Stops on the first IPC error (e.g. backend down) and
/// surfaces it — never fabricates a score for a task that didn't run.
export function useEvalRun() {
  const run = useCallback(async (model: string, backend: BackendKind) => {
    const { tasks, setResult, setRunning, setError, reset } = useEvalStore.getState();
    reset();
    setRunning(true);
    try {
      for (const t of tasks) {
        setRunning(true, t.id);
        const r = await runEvalTask(t.id, model, backend);
        setResult(r);
      }
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setRunning(false, null);
    }
  }, []);
  return { run };
}
