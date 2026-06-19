import type { Tier, TierStat } from "../../shared/ipc/eval/readiness";

/// Float tolerance so a true 4/5 = 0.8 never reads below an 0.80 bar (mirrors the Rust
/// `EPSILON` the backend's `cleared_tier` uses, keeping the Matrix and the Executive
/// Verdict on the same threshold).
const EPSILON = 1e-6;

export const TIER_ORDER: Tier[] = ["easy", "medium", "hard", "extreme"];
export const tierRank = (t: Tier): number => TIER_ORDER.indexOf(t);
export const tierPassRate = (s: TierStat): number => (s.tasks_total > 0 ? s.tasks_passed / s.tasks_total : 0);

export type TierResult = "clear" | "saturated" | "fail";

/// A tier's badge: CLEAR (≥ min_pass_k) · SATURATED (partial — the anti-saturation signal)
/// · FAIL (zero). Same `min_pass_k` bar the backend's `cleared_tier` uses, so a Matrix
/// CLEAR for tier T ⟺ T is in the Executive Verdict's cleared set.
export function tierResult(s: TierStat, minPassK: number): TierResult {
  const r = tierPassRate(s);
  if (r >= minPassK - EPSILON) return "clear";
  if (r > 0) return "saturated";
  return "fail";
}

export type VerdictStatus = "ready" | "conditional" | "not_ready";

export interface TierCurve {
  /// Run tiers ascending (Easy→Extreme), only those actually exercised.
  runTiers: TierStat[];
  /// Highest tier exercised — the headline "tier tested". `null` when no agentic run.
  tierTested: Tier | null;
  /// Highest tier cleared *contiguously* from the lowest run tier (`null` if the lowest
  /// failed). Use this for any "clears up to X" phrasing — `cleared_tier` (max-among-run)
  /// can sit above a lower failed tier and would overclaim.
  clearsThrough: Tier | null;
  clearedSet: Set<Tier>;
  status: VerdictStatus;
}

/// Derive the saturation curve from a model's per-tier breakdown. Status is
/// hardware-independent: READY only when every tier tested cleared up to the hardest,
/// CONDITIONAL for a cleared prefix or a non-monotonic curve, NOT READY when nothing
/// cleared. (The caller treats an empty `tierTested` as "no agentic run", not NOT READY.)
export function deriveTierCurve(byTier: TierStat[] | undefined, minPassK: number): TierCurve {
  const runTiers = [...(byTier ?? [])].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  const clearedSet = new Set(runTiers.filter((s) => tierResult(s, minPassK) === "clear").map((s) => s.tier));
  const tierTested = runTiers.length ? runTiers[runTiers.length - 1].tier : null;

  let clearsThrough: Tier | null = null;
  for (const s of runTiers) {
    if (clearedSet.has(s.tier)) clearsThrough = s.tier;
    else break;
  }

  let status: VerdictStatus;
  if (clearedSet.size === 0) status = "not_ready";
  else if (clearsThrough === tierTested) status = "ready";
  else status = "conditional"; // a cleared prefix OR a non-monotonic curve

  return { runTiers, tierTested, clearsThrough, clearedSet, status };
}
