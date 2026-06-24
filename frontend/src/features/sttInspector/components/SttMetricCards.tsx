import type { Transcript } from "../../../shared/ipc/stt/transcribe";
import { wordsPerSec } from "../format/sttMetrics";

/// A measured value or `null` → "N/A" (or a backend-specific note). Never a guessed
/// number — mirrors the no-fake-metrics framing of the text Inspector.
function Card({ label, value, na, testid }: { label: string; value: string | null; na?: string; testid: string }) {
  const missing = value == null;
  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-white">
      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="font-mono text-lg text-gray-900 mt-1" data-testid={missing ? `${testid}-na` : testid}>
        {missing ? (na ?? "N/A") : value}
      </div>
    </div>
  );
}

const pct = (x: number | null | undefined) => (x == null ? null : `${Math.round(x * 100)}%`);
const secs = (s: number | null | undefined) => (s == null ? null : `${s.toFixed(1)} s`);

/// The STT metric-card grid — the big-number summary of a finished transcript.
/// Every cell that the backend can't supply shows "N/A".
export function SttMetricCards({ transcript }: { transcript: Transcript }) {
  const { stats } = transcript;
  const perf = transcript.stt_profile?.perf ?? null;
  const beh = transcript.stt_profile?.behavioral ?? null;
  const conf = beh?.confidence ?? null;
  const wps = wordsPerSec(transcript);

  const confidence = conf == null ? null : `${Math.round(conf.mean * 100)}% (low ${Math.round(conf.low_percentile * 100)}%)`;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid="stt-metric-cards">
      <Card label="Real-time factor" value={stats.rtf == null ? null : `${stats.rtf.toFixed(2)}×`} testid="stt-card-rtf" />
      <Card label="First-segment latency" value={perf?.first_segment_ms == null ? null : `${perf.first_segment_ms} ms`} testid="stt-card-first-segment" />
      <Card label="Words / sec" value={wps == null ? null : wps.toFixed(1)} testid="stt-card-wps" />
      <Card label="Segments" value={stats.segment_count == null ? null : String(stats.segment_count)} testid="stt-card-segments" />
      <Card label="Audio duration" value={secs(stats.audio_decoded_secs)} testid="stt-card-audio" />
      <Card label="Transcribe wall" value={stats.transcribe_wall_ms == null ? null : `${(stats.transcribe_wall_ms / 1000).toFixed(1)} s`} testid="stt-card-wall" />
      <Card label="Mean confidence" value={confidence} testid="stt-card-confidence" />
      <Card label="Repeated-segment rate" value={pct(beh?.repeat_rate)} testid="stt-card-repeat" />
      <Card label="Output during silence" value={pct(beh?.silence_hallucination_rate)} testid="stt-card-silence" />
      <Card label="Detected language" value={stats.detected_language} testid="stt-card-language" />
      <Card label="VRAM" value={null} na="Not available for this backend" testid="stt-card-vram" />
    </div>
  );
}
