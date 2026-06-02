import type { ToolTask } from "../../shared/ipc/eval/registry";

/// Rough chars-per-token for labelling padding sizes. The probe is indicative,
/// so we approximate context size rather than tokenize (no tokenizer in-app).
const CHARS_PER_TOKEN = 4;
const FILLER = "The quick brown fox jumps over the lazy dog. ";

export interface CliffPoint {
  approxTokens: number;
  composite: number | null;
}

/// Prepend ~`approxTokens` of benign filler to a task's prompt to inflate the
/// context the model must read before the real instruction.
export function padTask(task: ToolTask, approxTokens: number): ToolTask {
  if (approxTokens <= 0) return task;
  const chars = approxTokens * CHARS_PER_TOKEN;
  const filler = FILLER.repeat(Math.ceil(chars / FILLER.length)).slice(0, chars);
  return { ...task, prompt: `${filler}\n\n${task.prompt}` };
}

/// Ascending padding sizes (approx tokens), always starting at 0 (the unpadded
/// baseline) and ending at `maxApproxTokens`.
export function buildLadder(maxApproxTokens: number, steps: number): number[] {
  if (steps <= 1) return [0];
  return Array.from({ length: steps }, (_, i) => Math.round((maxApproxTokens * i) / (steps - 1)));
}

/// First padding step whose composite drops ≥ `margin` below the unpadded
/// baseline — the approximate "cliff". null if it never collapses (or there's
/// no baseline). Errored steps (null composite) are skipped.
export function cliffPoint(points: CliffPoint[], margin = 0.15): number | null {
  const base = points.find((p) => p.approxTokens === 0)?.composite;
  if (base == null) return null;
  for (const p of points) {
    if (p.approxTokens > 0 && p.composite != null && base - p.composite >= margin) return p.approxTokens;
  }
  return null;
}
