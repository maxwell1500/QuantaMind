import type { TokenTiming } from "../../../shared/ipc/events/events";

export type BarKind = "ttft" | "normal" | "outlier";

export interface LatencyBar {
  index: number; // token number (1-based, == TokenTiming.n)
  token: string;
  latencyMs: number;
  kind: BarKind;
}

export interface TimelineStats {
  meanMs: number; // mean of inter-token gaps (TTFT excluded)
  stdMs: number; // population std of those gaps
  maxMs: number; // max over all bars (incl. TTFT)
  gapMaxMs: number; // max over inter-token gaps only (0 if none)
}

export interface TimelineChart {
  bars: LatencyBar[];
  stats: TimelineStats;
}

const EMPTY: TimelineChart = {
  bars: [],
  stats: { meanMs: 0, stdMs: 0, maxMs: 0, gapMaxMs: 0 },
};

/// Turn a per-token timeline into latency bars. The first token's bar is the
/// TTFT (annotated separately); every later bar is the gap from the previous
/// token. Mean/std are computed over the gaps only (TTFT is structurally
/// different); a gap is an outlier when it exceeds mean + 2*std. Pure.
export function buildLatencyBars(
  timeline: TokenTiming[],
  ttftMs: number | null,
): TimelineChart {
  if (timeline.length === 0) return EMPTY;

  const gaps: number[] = [];
  for (let i = 1; i < timeline.length; i++) {
    gaps.push(timeline[i].t_ms - timeline[i - 1].t_ms);
  }
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const variance = gaps.length
    ? gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length
    : 0;
  const std = Math.sqrt(variance);
  const threshold = mean + 2 * std;
  const canFlag = gaps.length >= 2 && std > 0;

  const bars: LatencyBar[] = timeline.map((t, i) => {
    if (i === 0) {
      return { index: t.n, token: t.text, latencyMs: ttftMs ?? t.t_ms, kind: "ttft" };
    }
    const latencyMs = t.t_ms - timeline[i - 1].t_ms;
    const kind: BarKind = canFlag && latencyMs > threshold ? "outlier" : "normal";
    return { index: t.n, token: t.text, latencyMs, kind };
  });

  const maxMs = bars.reduce((m, b) => Math.max(m, b.latencyMs), 0);
  const gapMaxMs = gaps.reduce((m, g) => Math.max(m, g), 0);
  return { bars, stats: { meanMs: mean, stdMs: std, maxMs, gapMaxMs } };
}
