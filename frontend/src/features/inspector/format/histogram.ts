import type { LatencyBar } from "./timeline";

export interface HistogramBucket {
  loMs: number;
  hiMs: number;
  count: number;
  hasOutlier: boolean;
}

/// Bucket inter-token gaps (excludes the TTFT bar) into equal-width latency
/// bins so jitter is visible as a distribution. A bin holding any
/// outlier-flagged gap is marked. Returns [] for <2 gaps (no distribution).
/// Bin count is capped at the gap count so tiny runs aren't over-bucketed. Pure.
export function buildHistogram(bars: LatencyBar[], bucketCount = 12): HistogramBucket[] {
  const gaps = bars.filter((b) => b.kind !== "ttft");
  if (gaps.length < 2) return [];
  const max = gaps.reduce((m, b) => Math.max(m, b.latencyMs), 0);
  if (max <= 0) return [];
  const n = Math.min(bucketCount, gaps.length);
  const width = max / n;
  const buckets: HistogramBucket[] = Array.from({ length: n }, (_, i) => ({
    loMs: i * width,
    hiMs: (i + 1) * width,
    count: 0,
    hasOutlier: false,
  }));
  for (const b of gaps) {
    const idx = Math.min(n - 1, Math.floor(b.latencyMs / width));
    buckets[idx].count += 1;
    if (b.kind === "outlier") buckets[idx].hasOutlier = true;
  }
  return buckets;
}
