import { useCompareStore } from "../state/compareStore";
import { barRows, type Metric } from "../format/metricsBars";

const METRICS: { metric: Metric; title: string; fmt: (v: number) => string }[] = [
  { metric: "tokens_per_sec", title: "Throughput", fmt: (v) => `${v.toFixed(1)} tok/s` },
  { metric: "ttft_ms", title: "Time to first token", fmt: (v) => `${Math.round(v)} ms` },
];

/// Hand-rolled horizontal bar charts comparing the done rows on throughput and
/// TTFT (bar width = value / max). No chart library — just normalized divs.
export function MetricsChart() {
  const rows = useCompareStore((s) => s.rows);
  const groups = METRICS
    .map((m) => ({ ...m, bars: barRows(rows, m.metric) }))
    .filter((g) => g.bars.length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="space-y-2 border rounded p-2" data-testid="metrics-chart">
      {groups.map((g) => (
        <div key={g.metric} data-testid={`metrics-${g.metric}`} className="space-y-0.5">
          <div className="text-xs font-medium text-gray-600">{g.title}</div>
          {g.bars.map((b) => (
            <div key={b.model} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 truncate" title={b.model}>{b.model}</span>
              <div className="flex-1 bg-gray-100 rounded h-3">
                <div className="bg-blue-500 h-3 rounded" style={{ width: `${Math.round(b.fraction * 100)}%` }} />
              </div>
              <span className="w-20 text-right text-gray-600">{g.fmt(b.value)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
