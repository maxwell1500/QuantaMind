import { useCallback, useState } from "react";
import { runToolcallEval } from "../../../shared/ipc/eval/toolcall";
import type { ToolTask } from "../../../shared/ipc/eval/registry";
import type { BackendKind } from "../../../shared/ipc/models/storage";
import type { InferenceParams } from "../../../shared/ipc/workspace/prompts";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { buildLadder, padTask, type CliffPoint } from "../cliff";

const DEFAULT_LADDER_MAX = 16384; // top of the padding ladder (units, ×4 chars)
const DEFAULT_LADDER_STEPS = 5;

/// Run the selected dataset at increasing prompt lengths and collect composite
/// tool-call accuracy at each step. Sequential (one run per rung); a failed rung
/// records a null composite (the chart drops it) AND surfaces the first error so
/// a backend failure is never a silent blank chart.
export function useContextCliff(
  model: string,
  backend: BackendKind,
  tasks: ToolTask[],
  maxApproxTokens = DEFAULT_LADDER_MAX,
  steps = DEFAULT_LADDER_STEPS,
  params?: InferenceParams,
) {
  const [points, setPoints] = useState<CliffPoint[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setPoints([]);
    setError(null);
    try {
      // The probe IS about context depth, so give Ollama a window big enough for
      // the largest rung (else it truncates the prompt at the default 4096 and the
      // measured depth plateaus). Headroom for the task/system/tool text; respect a
      // higher user-set num_ctx. (No-op for llama.cpp/MLX, which ignore num_ctx.)
      const probeParams = { ...params, num_ctx: Math.max(params?.num_ctx ?? 0, maxApproxTokens + 2048) };
      for (const padUnits of buildLadder(maxApproxTokens, steps)) {
        try {
          const r = await runToolcallEval(model, backend, tasks.map((t) => padTask(t, padUnits)), "", probeParams);
          // Plot the model's REAL reported prompt-token depth, never the knob.
          setPoints((p) => [...p, { promptTokens: r.prompt_tokens, composite: r.composite }]);
        } catch (e) {
          setPoints((p) => [...p, { promptTokens: null, composite: null }]);
          setError((prev) => prev ?? formatIpcError(e));
        }
      }
    } finally {
      setRunning(false);
    }
  }, [model, backend, tasks, maxApproxTokens, steps, params]);

  const reset = useCallback(() => {
    setPoints([]);
    setError(null);
  }, []);

  return { points, running, error, run, reset };
}
