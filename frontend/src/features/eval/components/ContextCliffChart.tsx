import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import type { CliffPoint } from "../cliff";

const M = { top: 8, right: 12, bottom: 22, left: 34 };

/// Composite tool-call accuracy (y, 0–100%) vs approximate context tokens (x).
/// A descending curve is the "context cliff". Plain SVG over @visx scales.
export function ContextCliffChart({ points, width, height }: { points: CliffPoint[]; width: number; height: number }) {
  const pts = points.filter((p): p is { approxTokens: number; composite: number } => p.composite != null);
  const iw = Math.max(0, width - M.left - M.right);
  const ih = Math.max(0, height - M.top - M.bottom);
  const xMax = Math.max(1, ...pts.map((p) => p.approxTokens));
  const x = scaleLinear({ domain: [0, xMax], range: [0, iw] });
  const y = scaleLinear({ domain: [0, 1], range: [ih, 0] });
  const line = pts.map((p) => `${x(p.approxTokens)},${y(p.composite)}`).join(" ");

  return (
    <svg width={width} height={height} role="img" aria-label="Context cliff: tool-call accuracy vs context" data-testid="cliff-chart">
      <Group left={M.left} top={M.top}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="#f1f5f9" />
            <text x={-6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="#9ca3af">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {pts.length > 1 && <polyline points={line} fill="none" stroke="#2563eb" strokeWidth={1.5} />}
        {pts.map((p) => (
          <circle key={p.approxTokens} cx={x(p.approxTokens)} cy={y(p.composite)} r={3} fill="#2563eb" data-testid={`cliff-pt-${p.approxTokens}`} />
        ))}
        <text x={iw} y={ih + 16} textAnchor="end" fontSize={10} fill="#9ca3af">≈ context tokens (approx) →</text>
      </Group>
    </svg>
  );
}
