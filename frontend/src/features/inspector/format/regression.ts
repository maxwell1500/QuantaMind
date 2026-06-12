import type { HistoryEntry } from "../../../shared/ipc/workspace/history";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const SLOW_PCT = 20; // ≥20% slower than baseline → flag

export type RegressionStatus = "ok" | "slow" | "insufficient";
export interface RegressionVerdict {
  status: RegressionStatus;
  currentTps: number | null;
  baselineTps: number | null;
  pctSlower: number; // (baseline − current) / baseline * 100
  n: number; // baseline sample count
}

const INSUFFICIENT: RegressionVerdict = {
  status: "insufficient", currentTps: null, baselineTps: null, pctSlower: 0, n: 0,
};

/// Compare a model's latest run against the rolling 7-day average of its prior
/// runs with the same prompt. `slow` when ≥20% below the baseline tok/s. Needs
/// at least one comparable prior run, else `insufficient`. Pure (`nowMs` given).
export function regressionVerdict(
  history: HistoryEntry[],
  model: string,
  nowMs: number,
): RegressionVerdict {
  const mine = history.filter((e) => e.model === model);
  const current = mine[0];
  if (!current || current.tokens_per_sec == null) return INSUFFICIENT;
  const pool = mine.slice(1).filter(
    (e) =>
      e.user === current.user &&
      e.tokens_per_sec != null &&
      nowMs - Date.parse(e.ran_at) <= WEEK_MS,
  );
  if (pool.length === 0) return INSUFFICIENT;
  const baselineTps =
    pool.reduce((s, e) => s + (e.tokens_per_sec as number), 0) / pool.length;
  const currentTps = current.tokens_per_sec;
  const pctSlower = baselineTps > 0 ? ((baselineTps - currentTps) / baselineTps) * 100 : 0;
  return {
    status: pctSlower >= SLOW_PCT ? "slow" : "ok",
    currentTps,
    baselineTps,
    pctSlower,
    n: pool.length,
  };
}
