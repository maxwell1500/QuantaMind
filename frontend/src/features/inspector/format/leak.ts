export interface LeakVerdict {
  suspected: boolean;
  growthBytes: number;
  samples: number;
}

// Below this net growth across the window we treat it as noise, not a leak.
const FLOOR_BYTES = 256 * 1024 * 1024; // 256 MB

/// Basic heuristic: flag a suspected leak when the last `n` Ollama-RSS samples
/// rose monotonically with net growth above a noise floor. Needs ≥`n` samples.
/// Heuristic by design — model loads/unloads move RSS legitimately. Pure.
export function detectLeak(series: number[], n = 5, floorBytes = FLOOR_BYTES): LeakVerdict {
  const samples = series.length;
  if (samples < n) return { suspected: false, growthBytes: 0, samples };
  const w = series.slice(-n);
  const monotonic = w.every((v, i) => i === 0 || v >= w[i - 1]);
  const growthBytes = w[w.length - 1] - w[0];
  return { suspected: monotonic && growthBytes > floorBytes, growthBytes, samples };
}
