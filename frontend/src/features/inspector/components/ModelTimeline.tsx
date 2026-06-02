import { useState } from "react";
import type { CompareRow } from "../../compare/state/compareRow";
import type { LoadedModel } from "../../../shared/ipc/system/vram";
import type { HistoryEntry } from "../../../shared/ipc/workspace/history";
import { buildLatencyBars, type LatencyBar } from "../format/timeline";
import { buildHistogram } from "../format/histogram";
import { TokenTimeline } from "./TokenTimeline";
import { LatencyHistogram } from "./LatencyHistogram";
import { TtftBreakdown } from "./TtftBreakdown";
import { VramBar } from "./VramBar";
import { ContextBudgetBar } from "./ContextBudgetBar";
import { ColdWarmPanel } from "./ColdWarmPanel";
import { RegressionAlert } from "./RegressionAlert";

const tag = (k: LatencyBar["kind"]) => (k === "ttft" ? " (TTFT)" : k === "outlier" ? " (outlier)" : "");

/// One model's timing: name + summary, a hover readout, and its bar chart.
export function ModelTimeline({ row, width, vram, history = [], deviceTotalBytes, unified }: {
  row: CompareRow; width: number; vram?: LoadedModel; history?: HistoryEntry[];
  deviceTotalBytes?: number | null; unified?: boolean;
}) {
  const [hovered, setHovered] = useState<LatencyBar | null>(null);
  const m = row.metrics;
  const { bars, stats } = buildLatencyBars(m?.timeline ?? [], m?.ttft_ms ?? null);
  const histogram = buildHistogram(bars);
  const outliers = bars.filter((b) => b.kind === "outlier").length;
  const tps = m?.tokens_per_sec;

  return (
    <div className="space-y-1" data-testid={`model-timeline-${row.model}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-ink">{row.model}</span>
        <span className="text-xs text-gray-500">
          {m?.token_count ?? 0} tokens · TTFT {m?.ttft_ms ?? "—"}ms ·{" "}
          {tps != null ? `${tps.toFixed(1)} tok/s` : "— tok/s"} ·{" "}
          <span data-testid={`outliers-${row.model}`}>{outliers} outlier{outliers === 1 ? "" : "s"}</span>
        </span>
      </div>
      <TtftBreakdown ttftMs={m?.ttft_ms ?? null} stats={m?.stats} />
      <VramBar entry={vram} deviceTotalBytes={deviceTotalBytes} unified={unified} />
      <ContextBudgetBar promptTokens={m?.stats?.prompt_eval_count ?? null} contextLength={vram?.context_length ?? null} />
      <ColdWarmPanel model={row.model} history={history} />
      <RegressionAlert model={row.model} history={history} />
      <div className="text-xs text-gray-500 h-4" data-testid={`readout-${row.model}`}>
        {hovered
          ? `#${hovered.index} · ${hovered.latencyMs}ms${tag(hovered.kind)} — ${JSON.stringify(hovered.token)}`
          : "Hover a bar for token detail"}
      </div>
      <TokenTimeline bars={bars} stats={stats} width={width || 640} height={140}
        hoveredIndex={hovered?.index ?? null} onHover={setHovered} />
      {histogram.length > 0 && (
        <div data-testid={`histogram-${row.model}`}>
          <div className="text-[11px] text-gray-400">Latency distribution</div>
          <LatencyHistogram buckets={histogram} width={width || 640} height={90} />
        </div>
      )}
    </div>
  );
}
