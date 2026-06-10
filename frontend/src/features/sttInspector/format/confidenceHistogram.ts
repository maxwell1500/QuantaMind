import type { ConfidenceBar } from "./confidenceTimeline";

export interface ConfidenceBucket {
  lo: number; // confidence 0..1
  hi: number;
  count: number;
  hasFlagged: boolean; // holds a low / silenceOut segment
}

/// Bucket per-segment confidences into equal-width bins over the natural [0,1]
/// domain so the distribution is visible. Only segments with a measured confidence
/// are counted (null logprob → no bar). A bin holding any flagged segment (low /
/// silenceOut) is marked. Returns [] for <2 measured points (no distribution).
/// Pure.
export function buildConfidenceHistogram(bars: ConfidenceBar[], bucketCount = 10): ConfidenceBucket[] {
  const measured = bars.filter((b) => b.confidence != null);
  if (measured.length < 2) return [];
  const n = Math.min(bucketCount, measured.length);
  const width = 1 / n;
  const buckets: ConfidenceBucket[] = Array.from({ length: n }, (_, i) => ({
    lo: i * width,
    hi: (i + 1) * width,
    count: 0,
    hasFlagged: false,
  }));
  for (const b of measured) {
    const idx = Math.min(n - 1, Math.floor((b.confidence as number) / width));
    buckets[idx].count += 1;
    if (b.kind !== "ok") buckets[idx].hasFlagged = true;
  }
  return buckets;
}
