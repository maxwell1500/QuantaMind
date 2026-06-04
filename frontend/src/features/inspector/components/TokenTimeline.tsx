import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleLinear } from "@visx/scale";
import type { BarKind, LatencyBar, TimelineStats } from "../format/timeline";

const COLOR: Record<BarKind, string> = {
  ttft: "#d97706", // amber-600 — first token / TTFT
  normal: "#2563eb", // blue-600 — steady-state gap
  outlier: "#dc2626", // red-600 — >2σ spike
};

type Props = {
  bars: LatencyBar[];
  stats: TimelineStats;
  width: number;
  height: number;
  hoveredIndex?: number | null;
  onHover?: (bar: LatencyBar | null) => void;
  maxTime: number;
  loadMs: number;
  prefillMs: number;
  ttftMs: number | null;
  marginLeft?: number;
  marginRight?: number;
};

export function TokenTimeline({
  bars,
  stats,
  width,
  height,
  hoveredIndex,
  onHover,
  maxTime,
  loadMs,
  prefillMs,
  ttftMs,
  marginLeft = 60,
  marginRight = 150,
}: Props) {
  const M = { top: 8, right: marginRight, bottom: 8, left: marginLeft };
  const iw = Math.max(0, width - M.left - M.right);
  const ih = Math.max(0, height - M.top - M.bottom);

  // Scale to the steady-state gap max so jitter stays visible; TTFT clamps.
  const yMax = stats.gapMaxMs > 0 ? stats.gapMaxMs : stats.maxMs || 1;
  const x = scaleLinear({ domain: [0, maxTime || 1], range: [0, iw] });
  const y = scaleLinear({ domain: [0, yMax], range: [ih, 0] });
  const ticks = [0, yMax / 2, yMax];

  // Calculate dynamic bar width
  const remainderMs = Math.max(0, maxTime - loadMs - prefillMs);
  const genPct = maxTime > 0 ? remainderMs / maxTime : 1;
  const barWidth = Math.max(2, Math.min(8, ((iw * genPct) / (bars.length || 1)) * 0.6));

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Token latency timeline"
      data-testid="token-timeline"
      onMouseLeave={() => onHover?.(null)}
      className="select-none font-mono"
    >
      <Group left={M.left} top={M.top}>
        {/* Horizontal grid lines */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text
              x={-8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              fontSize={9}
              fill="#71717a"
              className="font-semibold"
            >
              {Math.round(t)}ms
            </text>
          </g>
        ))}

        {/* Vertical phase-boundary lines — colours match the TtftBreakdown phase
            track above (slate load, violet prefill); the TTFT line stays amber to
            match the TTFT token-event in the legend. */}
        {loadMs > 0 && (
          <line
            x1={x(loadMs)}
            x2={x(loadMs)}
            y1={0}
            y2={ih}
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="3,3"
          />
        )}
        {loadMs + prefillMs > 0 && (
          <line
            x1={x(loadMs + prefillMs)}
            x2={x(loadMs + prefillMs)}
            y1={0}
            y2={ih}
            stroke="#7c3aed"
            strokeWidth={1.5}
            strokeDasharray="3,3"
          />
        )}
        {ttftMs != null && ttftMs !== loadMs + prefillMs && (
          <line
            x1={x(ttftMs)}
            x2={x(ttftMs)}
            y1={0}
            y2={ih}
            stroke="#d97706"
            strokeWidth={1}
            strokeDasharray="2,2"
          />
        )}

        {/* Latency Bars */}
        {bars.map((b) => {
          // Plot at its cumulative emission timestamp tMs
          const bx = x(b.tMs) - barWidth / 2;
          const h = Math.min(ih, Math.max(0, ih - y(b.latencyMs)));
          const active = hoveredIndex === b.index;

          return (
            <g key={b.index}>
              <Bar
                x={bx}
                y={ih - h}
                width={barWidth}
                height={h}
                fill={COLOR[b.kind]}
                stroke={active ? "#111827" : "none"}
                strokeWidth={active ? 1 : 0}
                data-testid={`bar-${b.kind}-${b.index}`}
              />
              {/* Hit area for mouse hover */}
              <rect
                x={bx - barWidth / 2}
                y={0}
                width={barWidth * 2}
                height={ih}
                fill="transparent"
                onMouseEnter={() => onHover?.(b)}
                data-testid={`hit-${b.index}`}
                className="cursor-pointer"
              />
            </g>
          );
        })}
      </Group>
    </svg>
  );
}
