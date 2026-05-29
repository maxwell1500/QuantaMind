import { useCompareStore } from "../state/compareStore";
import { CompareColumn } from "./CompareColumn";
import { MetricsChart } from "./MetricsChart";
import { CompareDiff } from "./CompareDiff";
import { ExportButtons } from "./ExportButtons";

/// Read-only analysis of the latest Workspace run: throughput / TTFT bar charts
/// and (for two finished models) a word-level diff, plus export. Model
/// selection and running live in the Workspace.
export function AnalysisTab() {
  const rows = useCompareStore((s) => s.rows);

  if (rows.length === 0) {
    return (
      <section data-testid="tab-analysis" className="space-y-2">
        <h2 className="text-lg font-semibold">Analysis</h2>
        <p data-testid="analysis-empty" className="text-sm text-gray-500">
          Run one or more models in the Workspace, then come here to compare
          throughput, time-to-first-token, and outputs.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="tab-analysis" className="space-y-3">
      <h2 className="text-lg font-semibold">Analysis</h2>
      <div className="flex gap-2 overflow-x-auto" data-testid="compare-columns">
        {rows.map((r) => <CompareColumn key={r.model} row={r} />)}
      </div>
      <MetricsChart />
      <CompareDiff />
      <ExportButtons />
    </section>
  );
}
