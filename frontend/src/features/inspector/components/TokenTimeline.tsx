import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleBand, scaleLinear } from "@visx/scale";
import type { BarKind, LatencyBar, TimelineStats } from "../format/timeline";

const COLOR: Record<BarKind, string> = {
  ttft: "#7c3aed", // violet — first token / TTFT
  normal: "#2563eb", // blue — steady-state gap
  outlier: "#e11d48", // rose — >2σ spike
};
const M = { top: 8, right: 8, bottom: 8, left: 46 };

type Props = {
  bars: LatencyBar[];
  stats: TimelineStats;
  width: number;
  height: number;
  hoveredIndex?: number | null;
  onHover?: (bar: LatencyBar | null) => void;
};

export function TokenTimeline({ bars, stats, width, height, hoveredIndex, onHover }: Props) {
  const iw = Math.max(0, width - M.left - M.right);
  const ih = Math.max(0, height - M.top - M.bottom);
  // Scale to the steady-state gap max so jitter stays visible; TTFT clamps.
  const yMax = stats.gapMaxMs > 0 ? stats.gapMaxMs : stats.maxMs || 1;
  const x = scaleBand({ domain: bars.map((b) => b.index), range: [0, iw], padding: 0.2 });
  const y = scaleLinear({ domain: [0, yMax], range: [ih, 0] });
  const ticks = [0, yMax / 2, yMax];

  return (
    <svg width={width} height={height} role="img" aria-label="Token latency timeline" data-testid="token-timeline"
      onMouseLeave={() => onHover?.(null)}>
      <Group left={M.left} top={M.top}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="#f1f5f9" />
            <text x={-6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="#9ca3af">{Math.round(t)}ms</text>
          </g>
        ))}
        {bars.map((b) => {
          const bx = x(b.index) ?? 0;
          const h = Math.min(ih, Math.max(0, ih - y(b.latencyMs)));
          const active = hoveredIndex === b.index;
          return (
            <g key={b.index}>
              <Bar x={bx} y={ih - h} width={x.bandwidth()} height={h} fill={COLOR[b.kind]}
                stroke={active ? "#111827" : "none"} strokeWidth={active ? 1 : 0}
                data-testid={`bar-${b.kind}-${b.index}`} />
              <rect x={bx} y={0} width={x.bandwidth()} height={ih} fill="transparent"
                onMouseEnter={() => onHover?.(b)} data-testid={`hit-${b.index}`} />
            </g>
          );
        })}
      </Group>
    </svg>
  );
}
