import type { HistoryEntry } from "../../../shared/ipc/workspace/history";
import { regressionVerdict } from "../format/regression";

const fmt = (n: number | null) => (n != null ? n.toFixed(1) : "—");

/// Flags when this model's latest run is materially slower than its rolling
/// 7-day average for the same prompt. Hidden until a baseline exists; never
/// fabricates a comparison.
export function RegressionAlert({ model, history }: { model: string; history: HistoryEntry[] }) {
  const v = regressionVerdict(history, model, Date.now());
  if (v.status === "insufficient") return null;
  if (v.status === "ok") {
    return (
      <div className="text-[11px] text-gray-400" data-testid={`regression-ok-${model}`}>
        On par with the 7-day baseline ({fmt(v.currentTps)} vs {fmt(v.baselineTps)} tok/s).
      </div>
    );
  }
  return (
    <div className="text-[11px] rounded bg-amber-100 text-amber-800 px-2 py-1" data-testid={`regression-slow-${model}`}>
      ⚠ {Math.round(v.pctSlower)}% slower than the 7-day average for this prompt
      ({fmt(v.currentTps)} vs {fmt(v.baselineTps)} tok/s, n={v.n}).
    </div>
  );
}
