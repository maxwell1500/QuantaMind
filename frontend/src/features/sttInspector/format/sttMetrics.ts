import type { Segment, Transcript } from "../../../shared/ipc/stt/transcribe";

/// Real spoken-word count: whitespace tokens with content across all segments.
/// Used for the words/sec throughput analog — a measured count, not an estimate.
export function wordCount(segments: Segment[]): number {
  return segments.reduce((n, s) => n + s.text.split(/\s+/).filter((w) => w.length > 0).length, 0);
}

/// Transcription throughput: real words ÷ measured wall seconds. null when wall time
/// is missing/zero or no words were produced (never a fabricated 0 — see no-fake-metrics).
export function wordsPerSec(t: Transcript): number | null {
  const ms = t.stats.transcribe_wall_ms;
  if (ms == null || ms <= 0) return null;
  const words = wordCount(t.segments);
  if (words === 0) return null;
  return words / (ms / 1000);
}
