import type { ToolTask } from "../../shared/ipc/eval/registry";

/// Filler chars per ladder unit — used only to SIZE the benign padding string we
/// inject (a knob, not a reported metric). The plotted depth is the model's real
/// measured `prompt_eval_count`, never this estimate.
const CHARS_PER_UNIT = 4;
const FILLER = "The quick brown fox jumps over the lazy dog. ";

export interface CliffPoint {
  /// The model's REAL reported prompt-token depth for this rung (mean
  /// `prompt_eval_count`), or null when the backend didn't report it.
  promptTokens: number | null;
  composite: number | null;
}

/// Prepend `padUnits`×4 chars of benign filler to a task's prompt to inflate the
/// context the model must read before the real instruction. `padUnits` is just
/// the ladder knob; the resulting prompt's real token count is measured, not
/// assumed.
export function padTask(task: ToolTask, padUnits: number): ToolTask {
  if (padUnits <= 0) return task;
  const chars = padUnits * CHARS_PER_UNIT;
  const filler = FILLER.repeat(Math.ceil(chars / FILLER.length)).slice(0, chars);
  return { ...task, prompt: `${filler}\n\n${task.prompt}` };
}

/// Ascending padding amounts (ladder units), always starting at 0 (the unpadded
/// baseline) and ending at `maxUnits`.
export function buildLadder(maxUnits: number, steps: number): number[] {
  if (steps <= 1) return [0];
  return Array.from({ length: steps }, (_, i) => Math.round((maxUnits * i) / (steps - 1)));
}

/// First rung whose composite drops ≥ `margin` below the unpadded baseline (the
/// first rung) — the "cliff", reported as that rung's REAL measured prompt-token
/// depth. null if it never collapses, there's no baseline, or the cliff rung's
/// token depth wasn't reported. Errored rungs (null composite) are skipped.
/// Default 0.20 (20pp).
export function cliffPoint(points: CliffPoint[], margin = 0.2): number | null {
  const base = points[0]?.composite;
  if (base == null) return null;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.composite != null && base - p.composite >= margin) return p.promptTokens;
  }
  return null;
}
