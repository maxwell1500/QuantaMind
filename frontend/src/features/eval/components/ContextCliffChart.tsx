import { useState } from "react";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import type { CliffPoint } from "../cliff";
import { cliffPoint } from "../cliff";

const TT_W = 132;
const TT_H = 34;

const M = { top: 20, right: 24, bottom: 42, left: 52 };

const GRID_Y_TICKS = [0, 20, 40, 60, 80, 100];

/// Dark-themed chart matching the Context-Cliff Diagnostic Probe design.
/// Renders accuracy (%) vs prompt-token depth with a cliff threshold line.
export function ContextCliffChart({
  points,
  width,
  height,
}: {
  points: CliffPoint[];
  width: number;
  height: number;
}) {
  // Only rungs with BOTH a real measured token depth and an accuracy are
  // plottable — a rung whose backend reported no prompt_eval_count is dropped
  // rather than placed at a fabricated x.
  const pts = points.filter(
    (p): p is { promptTokens: number; composite: number } => p.composite != null && p.promptTokens != null,
  );
  const [hover, setHover] = useState<{ promptTokens: number; composite: number } | null>(null);
  const iw = Math.max(0, width - M.left - M.right);
  const ih = Math.max(0, height - M.top - M.bottom);

  const xMax = Math.max(1, ...pts.map((p) => p.promptTokens));
  const x = scaleLinear({ domain: [0, xMax], range: [0, iw] });
  const y = scaleLinear({ domain: [0, 100], range: [ih, 0] });

  const cliff = cliffPoint(points);
  const cliffX = cliff != null ? x(cliff) : null;

  // Build smooth polyline path
  const linePoints = pts.map((p) => `${x(p.promptTokens)},${y(p.composite * 100)}`).join(" ");

  // X-axis ticks: evenly spaced, human-readable
  const xTickCount = 6;
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    Math.round((xMax * i) / (xTickCount - 1)),
  );

  const formatX = (v: number) =>
    v === 0 ? "0" : v >= 1000 ? `${(v / 1000).toFixed(0)},000` : `${v}`;

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Context cliff: accuracy vs token depth"
      data-testid="cliff-chart"
      style={{ overflow: "visible" }}
    >
      <Group left={M.left} top={M.top}>
        {/* Grid lines Y */}
        {GRID_Y_TICKS.map((tick) => (
          <g key={tick}>
            <line
              x1={0}
              x2={iw}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
            <text
              x={-8}
              y={y(tick)}
              dy="0.35em"
              textAnchor="end"
              fontSize={10}
              fill="#9ca3af"
              fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Y-axis label */}
        <text
          transform={`translate(${-38}, ${ih / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={10}
          fill="#9ca3af"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        >
          Accuracy (%) ↑
        </text>

        {/* Cliff threshold vertical dashed line */}
        {cliffX != null && (
          <>
            <line
              x1={cliffX}
              x2={cliffX}
              y1={0}
              y2={ih}
              stroke="#ef4444"
              strokeWidth={1.5}
              strokeDasharray="5,4"
            />
            <text
              x={cliffX + 6}
              y={8}
              fontSize={9}
              fill="#ef4444"
              fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
              fontWeight={600}
            >
              Cliff Threshold (≈{Math.round(cliff! / 1000)}k)
            </text>
          </>
        )}

        {/* Area fill under the line */}
        {pts.length > 1 && (
          <polygon
            points={`${x(pts[0].promptTokens)},${ih} ${linePoints} ${x(pts[pts.length - 1].promptTokens)},${ih}`}
            fill="url(#cliffGradient)"
            opacity={0.35}
          />
        )}

        {/* Line */}
        {pts.length > 1 && (
          <polyline
            points={linePoints}
            fill="none"
            stroke="#93c5fd"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Dots */}
        {pts.map((p) => {
          const isCliff =
            cliff != null && p.composite * 100 < 50 && p.promptTokens >= cliff;
          return (
            <circle
              key={p.promptTokens}
              cx={x(p.promptTokens)}
              cy={y(p.composite * 100)}
              r={4}
              fill={isCliff ? "#ef4444" : "#93c5fd"}
              stroke={isCliff ? "#fca5a5" : "#bfdbfe"}
              strokeWidth={1.5}
              data-testid={`cliff-pt-${p.promptTokens}`}
            />
          );
        })}

        {/* Hover hit targets — wider than the dots so they're easy to land on */}
        {pts.map((p, i) => (
          <circle
            key={`hit-${p.promptTokens}`}
            cx={x(p.promptTokens)}
            cy={y(p.composite * 100)}
            r={10}
            fill="transparent"
            style={{ cursor: "pointer" }}
            data-testid={`cliff-point-${i}`}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover((h) => (h?.promptTokens === p.promptTokens ? null : h))}
          />
        ))}

        {/* Hover tooltip — token depth + accuracy for the point under the cursor */}
        {hover && (() => {
          const acc = Math.round(hover.composite * 100);
          const past = cliff != null && hover.promptTokens >= cliff;
          const ttX = Math.max(0, Math.min(iw - TT_W, x(hover.promptTokens) + 8));
          const ttY = Math.max(0, y(hover.composite * 100) - TT_H - 6);
          return (
            <g pointerEvents="none" data-testid="cliff-tooltip">
              <rect x={ttX} y={ttY} width={TT_W} height={TT_H} rx={6} fill="#0f1320" stroke="rgba(255,255,255,0.15)" />
              <text x={ttX + 9} y={ttY + 15} fill="#cbd5e1" fontSize={10} fontWeight={600} fontFamily="Inter, ui-sans-serif, system-ui, sans-serif">
                ≈{hover.promptTokens.toLocaleString()} ctx tokens
              </text>
              <text x={ttX + 9} y={ttY + 28} fill={past ? "#fca5a5" : "#93c5fd"} fontSize={10} fontFamily="Inter, ui-sans-serif, system-ui, sans-serif">
                {acc}% accuracy{past ? " · past cliff" : ""}
              </text>
            </g>
          );
        })()}

        {/* X-axis ticks */}
        {xTicks.map((v) => (
          <g key={v}>
            <line
              x1={x(v)}
              x2={x(v)}
              y1={ih}
              y2={ih + 4}
              stroke="rgba(255,255,255,0.2)"
            />
            <text
              x={x(v)}
              y={ih + 14}
              textAnchor="middle"
              fontSize={10}
              fill="#9ca3af"
              fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
            >
              {formatX(v)}
            </text>
          </g>
        ))}

        {/* X-axis label */}
        <text
          x={iw}
          y={ih + 32}
          textAnchor="end"
          fontSize={10}
          fill="#9ca3af"
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        >
          Prompt Token Depth →
        </text>

        {/* Gradient definition */}
        <defs>
          <linearGradient id="cliffGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
      </Group>
    </svg>
  );
}
