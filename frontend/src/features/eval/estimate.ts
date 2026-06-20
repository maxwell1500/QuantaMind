import type { ToolTask } from "../../shared/ipc/eval/registry";

const DEFAULT_K = 5;
const DEFAULT_STEPS = 10;
/// Rough mean output tokens per model call (for the time estimate only).
const AVG_TOKENS_PER_CALL = 200;

/// Worst-case model-call count for a batch run: every agentic task can take up to
/// `k × max_steps` calls (Pass^k × the step cap); single-turn tasks are one call.
/// Summed over the tasks, times the number of models. v2 tiered tasks always carry
/// `k`/`max_steps`, so this is exact for them (a heads-up before a heavy run).
export function estimateModelCalls(tasks: ToolTask[], modelCount: number): number {
  const perModel = tasks.reduce((sum, t) => {
    if (!t.agentic) return sum + 1;
    const k = t.agentic.k ?? DEFAULT_K;
    const steps = t.agentic.max_steps ?? DEFAULT_STEPS;
    return sum + k * steps;
  }, 0);
  return perModel * Math.max(1, modelCount);
}

/// Rough wall-clock hours for `calls` at a measured `tokPerSec` (0 → unknown).
export function estimateHours(calls: number, tokPerSec: number): number {
  if (tokPerSec <= 0) return 0;
  return (calls * AVG_TOKENS_PER_CALL) / tokPerSec / 3600;
}

/// A short human heads-up, e.g. "~7,680 model calls (~2.1 h)". Omits the time when
/// tok/s is unknown. Worst-case, so it never under-promises.
export function estimateLabel(tasks: ToolTask[], modelCount: number, tokPerSec = 0): string {
  const calls = estimateModelCalls(tasks, modelCount);
  const callsStr = `~${calls.toLocaleString()} model calls`;
  const h = estimateHours(calls, tokPerSec);
  return h > 0 ? `${callsStr} (~${h < 0.1 ? "<0.1" : h.toFixed(1)} h worst-case)` : callsStr;
}
