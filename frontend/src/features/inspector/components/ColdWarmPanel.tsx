import type { HistoryEntry } from "../../../shared/ipc/workspace/history";
import { coldWarmSummary } from "../format/coldwarm";

/// Cold-start vs warm-start comparison for one model, derived from run history.
/// Headlines the prompt-independent cost — the model-load time a cold start
/// adds — with TTFT shown as prompt-dependent context. Honest: no synthetic
/// numbers, hidden until both a cold and a warm run exist.
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
      <span className="text-ink">Cold start adds ~{s.deltaLoadMs ?? s.cold.avgLoadMs}ms model load</span>
      {" "}(cold load {s.cold.avgLoadMs}ms vs warm {s.warm.avgLoadMs ?? 0}ms · TTFT{" "}
      {s.cold.avgTtftMs}ms vs {s.warm.avgTtftMs}ms, prompt-dependent · n={s.cold.n}/{s.warm.n})
    </div>
  );
}
