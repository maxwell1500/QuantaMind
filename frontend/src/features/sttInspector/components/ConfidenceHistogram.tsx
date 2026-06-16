import { useState } from "react";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleBand, scaleLinear } from "@visx/scale";
import type { ConfidenceBucket } from "../format/confidenceHistogram";

const M = { top: 6, right: 8, bottom: 18, left: 30 };

/// Distribution of per-segment confidence: x = confidence bin (0..1), y = segment
/// count. Bins holding a flagged (low / silence-output) segment are rose. Mirrors
/// the LLM latency histogram.
export function ConfidenceHistogram({ buckets, width, height }: { buckets: ConfidenceBucket[]; width: number; height: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (buckets.length === 0) return null;
  const iw = Math.max(0, width - M.left - M.right);
  const ih = Math.max(0, height - M.top - M.bottom);
  const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  const x = scaleBand({ domain: buckets.map((_, i) => i), range: [0, iw], padding: 0.15 });
  const y = scaleLinear({ domain: [0, maxCount], range: [ih, 0] });
  const h = hovered != null ? buckets[hovered] : null;

  return (
    <div>
      <div className="text-[11px] text-gray-500 h-4" data-testid="confidence-histogram-readout">
        {h
          ? `${Math.round(h.lo * 100)}–${Math.round(h.hi * 100)}% · ${h.count} segment${h.count === 1 ? "" : "s"}${h.hasFlagged ? " (has flagged)" : ""}`
          : "x = confidence · y = segment count — hover a bar"}
      </div>
      <svg width={width} height={height} role="img" aria-label="Per-segment confidence histogram"
        data-testid="confidence-histogram" onMouseLeave={() => setHovered(null)}>
        <Group left={M.left} top={M.top}>
          {buckets.map((b, i) => {
            const bh = ih - y(b.count);
            const active = hovered === i;
            return (
              <g key={i}>
                <Bar x={x(i) ?? 0} y={ih - bh} width={x.bandwidth()} height={bh}
                  fill={b.hasFlagged ? "#e11d48" : "#2563eb"} opacity={active ? 1 : 0.85}
                  data-testid={b.hasFlagged ? "conf-hist-bar-flagged" : "conf-hist-bar"} />
                <rect x={x(i) ?? 0} y={0} width={x.bandwidth()} height={ih} fill="transparent"
                  onMouseEnter={() => setHovered(i)} data-testid={`conf-hist-hit-${i}`} />
              </g>
            );
          })}
          <text x={-6} y={y(maxCount)} dy="0.32em" fontSize={9} fill="#9ca3af" textAnchor="end">{maxCount}</text>
          <text x={-6} y={ih} dy="0.32em" fontSize={9} fill="#9ca3af" textAnchor="end">0</text>
          <text x={0} y={ih + 12} fontSize={9} fill="#9ca3af">0%</text>
          <text x={iw} y={ih + 12} fontSize={9} fill="#9ca3af" textAnchor="end">100%</text>
        </Group>
      </svg>
    </div>
  );
}
