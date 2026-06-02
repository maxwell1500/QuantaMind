/// How much of the model's context window the prompt consumed — the exact
/// server-reported `prompt_eval_count` over the model's `context_length`. Turns
/// red at ≥95% (you're about to overflow and silently drop earlier tokens).
/// "Not available" when either number is missing — no fabricated estimate.
export function ContextBudgetBar({ promptTokens, contextLength }: { promptTokens: number | null; contextLength: number | null }) {
  if (promptTokens == null || !contextLength) {
    return (
      <div className="text-[11px] text-gray-400" data-testid="context-budget">
        Context budget: Not available
      </div>
    );
  }
  const pct = Math.min(100, Math.round((promptTokens / contextLength) * 100));
  const hot = pct >= 95;
  return (
    <div className="text-[11px]" data-testid="context-budget">
      <div className="flex justify-between text-gray-500">
        <span>Context budget</span>
        <span>{promptTokens} / {contextLength} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded bg-gray-200 overflow-hidden">
        <div className={`h-full ${hot ? "bg-red-600" : "bg-emerald-600"}`} style={{ width: `${pct}%` }} data-testid="context-budget-fill" />
      </div>
    </div>
  );
}
