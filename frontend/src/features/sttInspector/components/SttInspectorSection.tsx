import { useSttResultStore } from "../state/sttResultStore";
import { buildConfidenceTimeline } from "../format/confidenceTimeline";
import { buildConfidenceHistogram } from "../format/confidenceHistogram";
import { ConfidenceTimeline, SEG_COLOR } from "./ConfidenceTimeline";
import { ConfidenceHistogram } from "./ConfidenceHistogram";
import { SttPhaseBar } from "./SttPhaseBar";
import { SttMetricCards } from "./SttMetricCards";
import { PipelineSummary } from "./PipelineSummary";

const LEGEND = [
  { kind: "ok" as const, label: "Confident" },
  { kind: "low" as const, label: "Low confidence" },
  { kind: "silenceOut" as const, label: "Speech over silence" },
];

/// STT Inspector section: the measured profile of the last transcription, rendered
/// with the same density as the LLM Inspector — wall-time phase bar, per-segment
/// confidence timeline, confidence distribution, and the metric-card grid. Renders
/// nothing until a transcription completes.
export function SttInspectorSection({ width }: { width: number }) {
  const t = useSttResultStore((s) => s.result);
  if (!t) return null;

  const chart = buildConfidenceTimeline(t.segments, t.audio.duration_secs);
  const buckets = buildConfidenceHistogram(chart.bars);
  const chartWidth = Math.max(320, width);

  return (
    <section className="space-y-3 border rounded-lg p-4" data-testid="stt-inspector-section">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-800">
          Whisper.cpp transcript · <span className="font-mono text-gray-500">{t.model}</span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          <span className="text-gray-400">Segments:</span>
          {LEGEND.map((l) => (
            <span key={l.kind} className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SEG_COLOR[l.kind] }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <SttPhaseBar firstSegmentMs={t.stt_profile?.perf?.first_segment_ms ?? null} wallMs={t.stats.transcribe_wall_ms} width={chartWidth} />

      <ConfidenceTimeline chart={chart} width={chartWidth} height={150} />

      {buckets.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Confidence distribution</div>
          <ConfidenceHistogram buckets={buckets} width={chartWidth} height={110} />
        </div>
      )}

      <SttMetricCards transcript={t} />

      <PipelineSummary />
    </section>
  );
}
