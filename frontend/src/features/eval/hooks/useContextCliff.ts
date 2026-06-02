import { useCallback, useState } from "react";
import { runToolcallEval } from "../../../shared/ipc/eval/toolcall";
import type { ToolTask } from "../../../shared/ipc/eval/registry";
import type { BackendKind } from "../../../shared/ipc/models/storage";
import { buildLadder, padTask, type CliffPoint } from "../cliff";

const LADDER_MAX = 16000; // approx tokens of padding at the top of the ladder
const LADDER_STEPS = 5; // [0, 4k, 8k, 12k, 16k]

/// Run the selected dataset at increasing prompt lengths and collect composite
/// tool-call accuracy at each step. Sequential (one run per rung); a failed
/// rung records a null composite rather than a fabricated score.
export function useContextCliff(model: string, backend: BackendKind, tasks: ToolTask[]) {
  const [points, setPoints] = useState<CliffPoint[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setPoints([]);
    try {
      for (const approxTokens of buildLadder(LADDER_MAX, LADDER_STEPS)) {
        try {
          const r = await runToolcallEval(model, backend, tasks.map((t) => padTask(t, approxTokens)));
          setPoints((p) => [...p, { approxTokens, composite: r.composite }]);
        } catch {
          setPoints((p) => [...p, { approxTokens, composite: null }]);
        }
      }
    } finally {
      setRunning(false);
    }
  }, [model, backend, tasks]);

  return { points, running, run };
}
