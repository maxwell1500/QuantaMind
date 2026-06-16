import { useState } from "react";
import { Group } from "@visx/group";
import { Bar } from "@visx/shape";
import { scaleLinear } from "@visx/scale";
import type { ConfidenceChart, SegBarKind } from "../format/confidenceTimeline";

// Disjoint from the phase track and the LLM token colours so a colour means one
// thing. Bar height already encodes confidence; colour encodes the flag.
export const SEG_COLOR: Record<SegBarKind, string> = {
  ok: "#2563eb", // blue-600 — confident speech
  low: "#dc2626", // red-600 — below whisper's decode-failure gate
  silenceOut: "#ea580c", // orange-600 — text emitted over non-speech (hallucination risk)
};

const M = { top: 8, right: 12, bottom: 18, left: 36 };

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/// Per-segment confidence over the audio timeline (x = audio time, y = exp(avg_logprob)).
/// Each bar spans the segment's audio extent; null-confidence segments are gaps (no
/// fabricated 0). Low / silence-output segments are coloured as scrutiny markers.
export function ConfidenceTimeline({ chart, width, height }: { chart: ConfidenceChart; width: number; height: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const iw = Math.max(0, width - M.left - M.right);
  const ih = Math.max(0, height - M.top - M.bottom);
  const x = scaleLinear({ domain: [0, chart.audioSecs || 1], range: [0, iw] });
  const y = scaleLinear({ domain: [0, 1], range: [ih, 0] });
  const ticks = [0, 0.5, 1];

  const drawable = chart.bars.filter((b) => b.confidence != null);
  const h = hovered != null ? chart.bars.find((b) => b.index === hovered) ?? null : null;
  const readout = h
    ? `#${h.index} · ${h.confidence == null ? "conf N/A" : `${Math.round(h.confidence * 100)}%`} · ${fmtTime(h.tStart)}–${fmtTime(h.tEnd)}${h.kind !== "ok" ? `  (${h.kind === "low" ? "low confidence" : "speech over silence"})` : ""} · "${h.text.trim().slice(0, 60)}"`
    : "x = audio time · y = per-segment confidence — hover a bar";

  return (
    <div>
      <div className="text-[11px] text-gray-500 h-4 truncate font-mono" data-testid="confidence-readout">
        {readout}
      </div>
      <svg width={width} height={height} role="img" aria-label="Per-segment confidence timeline"
        data-testid="confidence-timeline" onMouseLeave={() => setHovered(null)} className="select-none font-mono">
        <Group left={M.left} top={M.top}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={9} fill="#71717a">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {drawable.map((b) => {
            const bx = x(b.tStart);
            const bw = Math.max(2, x(b.tEnd) - x(b.tStart));
            const bh = Math.max(0, ih - y(b.confidence as number));
            const active = hovered === b.index;
            return (
              <g key={b.index}>
                <Bar x={bx} y={ih - bh} width={bw} height={bh} fill={SEG_COLOR[b.kind]}
                  stroke={active ? "#111827" : "none"} strokeWidth={active ? 1 : 0}
                  data-testid={`conf-bar-${b.kind}-${b.index}`} />
                <rect x={bx} y={0} width={Math.max(bw, 6)} height={ih} fill="transparent"
                  onMouseEnter={() => setHovered(b.index)} data-testid={`conf-hit-${b.index}`}
                  className="cursor-pointer" />
              </g>
            );
          })}
          <text x={0} y={ih + 12} fontSize={9} fill="#9ca3af">0:00</text>
          <text x={iw} y={ih + 12} fontSize={9} fill="#9ca3af" textAnchor="end">{fmtTime(chart.audioSecs)}</text>
        </Group>
      </svg>
    </div>
  );
}
