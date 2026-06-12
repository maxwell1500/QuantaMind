export interface LeakSample {
  model: string;
  rssBytes: number;
}
export interface LeakVerdict {
  suspected: boolean;
  growthBytes: number;
  samples: number;
}

// Below this net growth across the window we treat it as noise, not a leak.
const FLOOR_BYTES = 256 * 1024 * 1024; // 256 MB

/// Basic heuristic: flag a suspected leak when the last `n` samples are the
/// **same model** and rose monotonically with net growth above a noise floor.
/// Requiring one model avoids false positives from model switches (loading a
/// different model legitimately raises RSS). Heuristic by design. Pure.
export function detectLeak(series: LeakSample[], n = 5, floorBytes = FLOOR_BYTES): LeakVerdict {
  const samples = series.length;
  if (samples < n) return { suspected: false, growthBytes: 0, samples };
  const w = series.slice(-n);
  const sameModel = w.every((s) => s.model === w[0].model);
  const monotonic = w.every((s, i) => i === 0 || s.rssBytes >= w[i - 1].rssBytes);
  const growthBytes = w[w.length - 1].rssBytes - w[0].rssBytes;
  return { suspected: sameModel && monotonic && growthBytes > floorBytes, growthBytes, samples };
}
