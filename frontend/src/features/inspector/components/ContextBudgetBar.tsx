import { useEffect, useState } from "react";

/// How much of the model's context window the prompt consumed — the exact
/// server-reported `prompt_eval_count` over the model's `context_length`.
/// Renders as a monospace CLI monitor. Shows "Not available" if missing.
export function ContextBudgetBar({
  modelName,
  promptTokens,
  contextLength,
}: {
  modelName: string;
  promptTokens: number | null;
  contextLength: number | null;
}) {
  const [cliffPoint, setCliffPoint] = useState<number | null>(null);

  useEffect(() => {
    if (modelName && typeof localStorage !== "undefined") {
      try {
        const val = localStorage.getItem(`quantamind-cliff-${modelName}`);
        if (val) {
          setCliffPoint(parseInt(val, 10));
          return;
        }
      } catch (e) {
        // ignore
      }
    }
    setCliffPoint(null);
  }, [modelName]);

  if (promptTokens == null || !contextLength) {
    return (
      <div className="text-[11px] text-gray-400 font-mono" data-testid="context-budget">
        Context budget: Not available
      </div>
    );
  }

  const pct = Math.min(100, Math.round((promptTokens / contextLength) * 100));
  const hot = pct >= 95;

  const totalCells = 50;
  const filledCells = Math.min(totalCells, Math.round((promptTokens / contextLength) * totalCells));
  const cliffCellIndex = cliffPoint && contextLength > 0
    ? Math.min(totalCells - 1, Math.round((cliffPoint / contextLength) * totalCells))
    : null;

  return (
    <div className="text-[11px] font-mono space-y-1" data-testid="context-budget">
      {/* Hidden assertions for unit tests */}
      <span className="hidden">{promptTokens} / {contextLength} ({pct}%)</span>
      <div
        data-testid="context-budget-fill"
        className={`hidden ${hot ? "bg-red-600" : "bg-green-600"}`}
        style={{ width: `${pct}%` }}
      />

      <div className="text-gray-500 font-semibold tracking-wider text-[10px] uppercase">
        CONTEXT WINDOW BUDGET
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center text-green-600 select-none font-mono tracking-tighter text-sm">
          <span className="text-gray-500">[</span>
          {Array.from({ length: totalCells }).map((_, i) => {
            let color = "text-gray-400";
            let char = "░";
            if (i < filledCells) {
              color = hot ? "text-red-600" : "text-green-600";
              char = "█";
            }
            const isCliff = i === cliffCellIndex;

            return (
              <span key={i} className={`relative inline-block w-[7px] text-center ${color}`}>
                {char}
                {isCliff && (
                  <span
                    className="absolute inset-y-0 left-0 w-[2px] bg-red-500 z-10"
                    title={`Indicative cliff edge ≈${cliffPoint} ctx (approximate token padding, not a tokenizer)`}
                  />
                )}
              </span>
            );
          })}
          <span className="text-gray-500">]</span>
        </div>
        <div className="text-gray-600 text-xs">
          {promptTokens} / {contextLength} ctx ({pct}%)
        </div>
      </div>

      {/* Cliff Edge caption under the bar (marker shown inline in the bar above) */}
      {cliffPoint && cliffCellIndex !== null && (
        <div className="text-[10px] text-red-600 font-semibold">
          ▲ Attention degradation bound — indicative cliff ≈{cliffPoint} ctx
        </div>
      )}
    </div>
  );
}
