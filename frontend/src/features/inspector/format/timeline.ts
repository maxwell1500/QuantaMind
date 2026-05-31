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

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/// Turn a per-token timeline into latency bars. The first token's bar is the
/// TTFT (annotated separately); every later bar is the gap from the previous
/// token. Outliers use the robust Iglewicz–Hoaglin rule on the gaps — a gap is
/// flagged when its modified z-score (median/MAD based) exceeds 3.5 — so a few
/// spikes don't inflate the threshold the way mean+2σ did on heavy-tailed token
/// latencies. Falls back to mean+2σ when MAD is 0 (near-quantized gaps). Pure.
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
  const med = gaps.length ? median(gaps) : 0;
  const mad = gaps.length ? median(gaps.map((g) => Math.abs(g - med))) : 0;
  // Upper-tail modified z-score > 3.5  ⇔  gap > median + (3.5/0.6745)·MAD.
  const threshold = mad > 0 ? med + (3.5 / 0.6745) * mad : std > 0 ? mean + 2 * std : Infinity;
  const canFlag = gaps.length >= 2;

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
