import { useCompareStore } from "../state/compareStore";
import { ModelMultiSelect } from "./ModelMultiSelect";
import { HardwareSummary } from "./HardwareSummary";
import { RunStrategyPicker } from "./RunStrategyPicker";
import { CompareToolbar } from "./CompareToolbar";
import { CompareColumn } from "./CompareColumn";

export function CompareTab() {
  const prompt = useCompareStore((s) => s.prompt);
  const setPrompt = useCompareStore((s) => s.setPrompt);
  const rows = useCompareStore((s) => s.rows);

  return (
    <section data-testid="tab-compare" className="space-y-3">
      <h2 className="text-lg font-semibold">Compare</h2>
      <p className="text-xs text-gray-600">
        Pick multiple models, write one prompt, run them side-by-side.
      </p>
      <ModelMultiSelect />
      <HardwareSummary />
      <RunStrategyPicker />
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Type the prompt to run against all selected models…"
        className="w-full border rounded p-2 text-sm font-mono"
        rows={4}
        data-testid="compare-prompt"
      />
      <CompareToolbar />
      {rows.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" data-testid="compare-columns">
          {rows.map((r) => <CompareColumn key={r.model} row={r} />)}
        </div>
      )}
    </section>
  );
}
