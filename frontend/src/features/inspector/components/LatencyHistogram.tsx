import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleBand, scaleLinear } from "@visx/scale";
import type { HistogramBucket } from "../format/histogram";

const M = { top: 8, right: 8, bottom: 16, left: 28 };

/// Distribution of inter-token latencies: x = latency bin, y = count. Buckets
/// containing a >2σ outlier are rose, the rest blue. Renders nothing when the
/// run is too short for a distribution.
export function LatencyHistogram({ buckets, width, height }: { buckets: HistogramBucket[]; width: number; height: number }) {
  if (buckets.length === 0) return null;
  const iw = Math.max(0, width - M.left - M.right);
  const ih = Math.max(0, height - M.top - M.bottom);
  const maxCount = buckets.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  const x = scaleBand({ domain: buckets.map((_, i) => i), range: [0, iw], padding: 0.15 });
  const y = scaleLinear({ domain: [0, maxCount], range: [ih, 0] });
  const hiMs = buckets[buckets.length - 1].hiMs;

  return (
    <svg width={width} height={height} role="img" aria-label="Inter-token latency histogram" data-testid="latency-histogram">
      <Group left={M.left} top={M.top}>
        {buckets.map((b, i) => {
          const h = ih - y(b.count);
          return (
            <Bar key={i} x={x(i) ?? 0} y={ih - h} width={x.bandwidth()} height={h}
              fill={b.hasOutlier ? "#e11d48" : "#2563eb"}
              data-testid={b.hasOutlier ? "hist-bar-outlier" : "hist-bar"}>
              <title>{`${Math.round(b.loMs)}–${Math.round(b.hiMs)}ms · ${b.count}`}</title>
            </Bar>
          );
        })}
        <text x={-6} y={y(maxCount)} dy="0.32em" fontSize={9} fill="#9ca3af" textAnchor="end">{maxCount}</text>
        <text x={0} y={ih + 12} fontSize={9} fill="#9ca3af">0ms</text>
        <text x={iw} y={ih + 12} fontSize={9} fill="#9ca3af" textAnchor="end">{Math.round(hiMs)}ms</text>
      </Group>
    </svg>
  );
}
