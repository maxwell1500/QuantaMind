import { useTranscriptStore } from "../state/transcriptStore";

/// A measured value or `null` when the backend couldn't report it. `null` always
/// renders as "N/A" (or a backend-specific note) — never a guessed number.
function Metric({ label, value, na, testid }: { label: string; value: string | null; na?: string; testid: string }) {
  const missing = value == null;
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-mono text-gray-900" data-testid={missing ? `${testid}-na` : testid}>
        {missing ? (na ?? "N/A") : value}
      </span>
    </div>
  );
}

const pct = (x: number | null | undefined) => (x == null ? null : `${Math.round(x * 100)}%`);

/// The STT Inspector: the measured performance + behavioral profile of the finished
/// transcript. Mirrors the text Inspector's no-fake-metrics framing — every metric
/// that the backend can't supply shows "N/A", never a fabricated value.
export function SttProfilePanel() {
  const status = useTranscriptStore((s) => s.status);
  const stats = useTranscriptStore((s) => s.stats);
  const profile = useTranscriptStore((s) => s.profile);
  if (status !== "done" || !stats) return null;

  const perf = profile?.perf ?? null;
  const beh = profile?.behavioral ?? null;
  const conf = beh?.confidence ?? null;

  const rtf = stats.rtf == null ? null : `${stats.rtf.toFixed(2)}×`;
  const firstSeg = perf?.first_segment_ms == null ? null : `${perf.first_segment_ms} ms`;
  const split =
    perf && perf.encode_ms != null && perf.decode_ms != null ? `${perf.encode_ms} / ${perf.decode_ms} ms` : null;
  const confidence =
    conf == null ? null : `${Math.round(conf.mean * 100)}% (low ${Math.round(conf.low_percentile * 100)}%)`;
  const vram = profile?.vram_bytes == null ? null : `${(profile.vram_bytes / 1024 ** 3).toFixed(1)} GB`;

  return (
    <div className="border rounded p-3 text-xs" data-testid="stt-profile-panel">
      <div className="font-medium text-gray-700 mb-2">Inspector</div>
      <Metric label="Real-time factor" value={rtf} testid="stt-rtf" />
      <Metric label="First-segment latency" value={firstSeg} testid="stt-first-segment" />
      <Metric label="Encode / decode split" value={split} na="N/A (not reported by whisper-server)" testid="stt-split" />
      <Metric label="Repeated-token rate" value={pct(beh?.repeat_rate)} testid="stt-repeat" />
      <Metric label="Mean confidence" value={confidence} testid="stt-confidence" />
      <Metric label="Output during silence" value={pct(beh?.silence_hallucination_rate)} testid="stt-silence" />
      <Metric label="VRAM" value={vram} na="Not available for this backend" testid="stt-vram" />
    </div>
  );
}
