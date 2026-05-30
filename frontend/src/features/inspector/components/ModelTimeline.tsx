import { useState } from "react";
import type { CompareRow } from "../../compare/state/compareRow";
import type { LoadedModel } from "../../../shared/ipc/system/vram";
import { buildLatencyBars, type LatencyBar } from "../format/timeline";
import { TokenTimeline } from "./TokenTimeline";
import { TtftBreakdown } from "./TtftBreakdown";
import { VramBar } from "./VramBar";

const tag = (k: LatencyBar["kind"]) => (k === "ttft" ? " (TTFT)" : k === "outlier" ? " (outlier)" : "");

/// One model's timing: name + summary, a hover readout, and its bar chart.
export function ModelTimeline({ row, width, vram }: { row: CompareRow; width: number; vram?: LoadedModel }) {
  const [hovered, setHovered] = useState<LatencyBar | null>(null);
  const m = row.metrics;
  const { bars, stats } = buildLatencyBars(m?.timeline ?? [], m?.ttft_ms ?? null);
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
      <VramBar entry={vram} />
      <div className="text-xs text-gray-500 h-4" data-testid={`readout-${row.model}`}>
        {hovered
          ? `#${hovered.index} · ${hovered.latencyMs}ms${tag(hovered.kind)} — ${JSON.stringify(hovered.token)}`
          : "Hover a bar for token detail"}
      </div>
      <TokenTimeline bars={bars} stats={stats} width={width || 640} height={140}
        hoveredIndex={hovered?.index ?? null} onHover={setHovered} />
    </div>
  );
}
