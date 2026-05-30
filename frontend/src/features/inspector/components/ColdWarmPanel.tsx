import type { HistoryEntry } from "../../../shared/ipc/workspace/history";
import { coldWarmSummary } from "../format/coldwarm";

/// Cold-start vs warm-start comparison for one model, derived from run history.
/// Shows the TTFT cost of a cold model-load once both a cold and a warm run
/// exist; otherwise a hint. Honest: no synthetic numbers.
export function ColdWarmPanel({ model, history }: { model: string; history: HistoryEntry[] }) {
  const s = coldWarmSummary(history, model);
  if (!s) {
    return (
      <div className="text-[11px] text-gray-400" data-testid={`coldwarm-na-${model}`}>
        Cold vs warm: run this model cold and again warm to compare.
      </div>
    );
  }
  return (
    <div className="text-[11px] text-gray-500" data-testid={`coldwarm-${model}`}>
      Cold start: TTFT {s.cold.avgTtftMs}ms (load {s.cold.avgLoadMs}ms, n={s.cold.n}) ·{" "}
      Warm: TTFT {s.warm.avgTtftMs}ms (n={s.warm.n})
      {s.deltaTtftMs != null && (
        <span className="text-ink"> · cold adds ~{s.deltaTtftMs}ms</span>
      )}
    </div>
  );
}
