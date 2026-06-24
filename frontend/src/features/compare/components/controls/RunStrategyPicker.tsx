import { useCompareStore } from "../../state/compareStore";
import { useSelectedModelStore } from "../../../../shared/state/selectedModelStore";
import { assessStrategies, type StrategyId, type Verdict } from "../../state/strategy";

type Option = { id: StrategyId; title: string; help: string };
const OPTIONS: Option[] = [
  { id: "sequential", title: "Sequential",
    help: "Run models one after another. Memory needed: max(model)." },
  { id: "parallel", title: "Parallel",
    help: "Issue all runs concurrently. Memory needed: sum(models)." },
];

const VERDICT_LABEL: Record<Verdict, string> = { ok: "OK", risky: "Risky", wont_fit: "Won't fit" };
const VERDICT_CLASS: Record<Verdict, string> = {
  ok: "bg-green-100 text-green-800",
  risky: "bg-amber-100 text-amber-800",
  wont_fit: "bg-red-100 text-red-800",
};

export function RunStrategyPicker() {
  const strategy = useCompareStore((s) => s.strategy);
  const setStrategy = useCompareStore((s) => s.setStrategy);
  const selected = useSelectedModelStore((s) => s.selectedModels);
  const snapshot = useCompareStore((s) => s.hardwareSnapshot);
  const matrix = assessStrategies(selected, snapshot);

  return (
    <fieldset className="space-y-1" data-testid="run-strategy-picker">
      <legend className="text-xs text-gray-600">Run strategy</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const active = strategy === opt.id;
          const v = matrix?.[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setStrategy(opt.id)}
              data-testid={`strategy-${opt.id}`}
              className={`text-left border rounded p-2 ${active ? "border-blue-600 bg-blue-50" : "hover:bg-gray-50"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{opt.title}</span>
                {v && (
                  <span data-testid={`strategy-verdict-${opt.id}`} className={`text-xs px-2 py-0.5 rounded ${VERDICT_CLASS[v.status]}`}>
                    {VERDICT_LABEL[v.status]}
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-600 mt-1">{opt.help}</div>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
