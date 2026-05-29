import { useCompareStore } from "../state/compareStore";
import { ModelMultiSelect } from "./ModelMultiSelect";
import { HardwareSummary } from "./HardwareSummary";
import { RunStrategyPicker } from "./RunStrategyPicker";
import { CompareToolbar } from "./CompareToolbar";
import { CompareColumn } from "./CompareColumn";
import { CompareDiff } from "./CompareDiff";
import { MetricsChart } from "./MetricsChart";
import { ExportButtons } from "./ExportButtons";
import { BenchConfigBar } from "./config/BenchConfigBar";

export function CompareTab() {
  const prompt = useCompareStore((s) => s.prompt);
  const setPrompt = useCompareStore((s) => s.setPrompt);
  const systemPrompt = useCompareStore((s) => s.systemPrompt);
  const setSystemPrompt = useCompareStore((s) => s.setSystemPrompt);
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
      <div className="space-y-1">
        <div className="text-xs text-gray-600">System prompt (optional)</div>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Set the system role used for every model…"
          className="w-full border rounded p-2 text-sm font-mono"
          rows={2}
          data-testid="compare-system-prompt"
        />
      </div>
      <div className="space-y-1">
        <div className="text-xs text-gray-600">User prompt</div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type the prompt to run against all selected models…"
          className="w-full border rounded p-2 text-sm font-mono"
          rows={4}
          data-testid="compare-prompt"
        />
      </div>
      <BenchConfigBar />
      <CompareToolbar />
      {rows.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto" data-testid="compare-columns">
            {rows.map((r) => <CompareColumn key={r.model} row={r} />)}
          </div>
          <MetricsChart />
          <CompareDiff />
          <ExportButtons />
        </>
      )}
    </section>
  );
}
