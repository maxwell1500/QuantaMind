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

/// Minimum baseline (unpadded, rung 0) composite for a probe to be a valid
/// cliff measurement. Below this the model is already failing the task at the
/// SMALLEST context, so there is no healthy plateau to fall off — "no cliff"
/// would be a lie. Mirrors the per-step Pass threshold in ContextCliffPanel.
export const CLIFF_BASELINE_PASS = 0.5;

/// The outcome of a completed probe, computed ONLY from the rung series:
/// - `no-baseline`  — rung 0 errored (null composite); nothing to compare against.
/// - `broken-baseline` — rung 0 scored below `CLIFF_BASELINE_PASS`; the model
///   fails from the start, so a cliff (a *drop* from a healthy plateau) is
///   meaningless. NOT "no cliff".
/// - `cliff` — accuracy collapsed ≥ `margin` below a healthy baseline, at `depth`
///   (the collapsing rung's REAL measured prompt-token depth, or null if the
///   backend reported no count for it).
/// - `no-cliff` — healthy baseline that held across the whole tested range.
export type CliffVerdict =
  | { kind: "no-baseline" }
  | { kind: "broken-baseline"; baseline: number }
  | { kind: "cliff"; depth: number | null }
  | { kind: "no-cliff" };

/// Classify a completed probe series. The baseline (rung 0) must clear
/// `CLIFF_BASELINE_PASS` before a "no-cliff"/"cliff" verdict is even
/// considered — a model that's broken at the smallest context can never
/// truthfully be reported as "accuracy held". `margin` defaults to 0.20 (20pp).
export function classifyCliff(points: CliffPoint[], margin = 0.2): CliffVerdict {
  const base = points[0]?.composite;
  if (base == null) return { kind: "no-baseline" };
  if (base < CLIFF_BASELINE_PASS) return { kind: "broken-baseline", baseline: base };
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.composite != null && base - p.composite >= margin) return { kind: "cliff", depth: p.promptTokens };
  }
  return { kind: "no-cliff" };
}

/// The measured cliff depth, or null when there is no cliff to report (healthy
/// baseline that held, broken/absent baseline, or a cliff rung the backend gave
/// no token count for). Thin wrapper over `classifyCliff` so the persisted depth
/// and the verdict can never disagree.
export function cliffPoint(points: CliffPoint[], margin = 0.2): number | null {
  const v = classifyCliff(points, margin);
  return v.kind === "cliff" ? v.depth : null;
}
