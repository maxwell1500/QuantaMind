import { useSttResultStore } from "../state/sttResultStore";
import { wordsPerSec } from "../format/sttMetrics";

// One value against a tick ruler — same monospace ▓-bar idiom as the LLM
// MetricsChart. A null value renders "Not available", never a fabricated 0.
const WIDTH = 50; // bar length in monospace chars

function niceLimit(v: number, round: number) {
  return v > 0 ? Math.ceil(v / round) * round : round;
}

function Bar({ label, value, unit, color, limit, ticks, fmt }: {
  label: string;
  value: number | null;
  unit: string;
  color: string;
  limit: number;
  ticks: number[];
  fmt: (v: number) => string;
}) {
  return (
    <div className="space-y-1" data-testid={`stt-bar-${label}`}>
      <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="relative h-4 text-gray-500 font-semibold text-[10px] w-full">
        <div className="absolute left-[5ch]" style={{ width: `${WIDTH}ch` }}>
          {ticks.map((t) => (
            <span key={t} className="absolute"
              style={{ left: `${(t / limit) * 100}%`, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
              │ {t}
            </span>
          ))}
        </div>
      </div>
      {value == null ? (
        <div className="flex items-center text-gray-400">
          <span className="w-[5ch]" />
          <span className="italic">Not available</span>
        </div>
      ) : (
        <div className="flex items-center text-gray-700">
          <span className="w-[5ch]" />
          <span className="font-bold select-none" style={{ color }}>
            {"▓".repeat(Math.min(WIDTH, Math.round((value / limit) * WIDTH)))}
          </span>
          <span className="text-gray-500 font-semibold mx-1">▏</span>
          <span className="text-gray-900 font-semibold">{fmt(value)} {unit}</span>
        </div>
      )}
    </div>
  );
}

/// Analysis-tab STT section: the headline transcription metrics as ruler bars plus
/// the transcript text. Auto-hides until a transcription completes.
export function SttAnalysisSection() {
  const t = useSttResultStore((s) => s.result);
  if (!t) return null;

  const rtf = t.stats.rtf;
  const wps = wordsPerSec(t);
  const firstSeg = t.stt_profile?.perf?.first_segment_ms ?? null;
  const text = t.segments.map((s) => s.text.trim()).filter(Boolean).join(" ");

  const rtfLimit = niceLimit(rtf ?? 0, 1);
  const wpsLimit = niceLimit(wps ?? 0, 1);
  const fsLimit = niceLimit(firstSeg ?? 0, 500);

  return (
    <section className="space-y-3" data-testid="stt-analysis-section">
      <div className="text-sm font-semibold text-gray-800">
        Whisper.cpp transcript · <span className="font-mono text-gray-500">{t.model}</span>
      </div>
      <div className="space-y-5 border border-gray-100 rounded-lg p-5 bg-gray-50 font-mono text-xs select-none">
        <Bar label="REAL-TIME FACTOR" value={rtf} unit="×" color="#16a34a" limit={rtfLimit}
          ticks={[rtfLimit / 2, rtfLimit]} fmt={(v) => v.toFixed(2)} />
        <Bar label="WORDS / SEC" value={wps} unit="w/s" color="#16a34a" limit={wpsLimit}
          ticks={[wpsLimit / 2, wpsLimit]} fmt={(v) => v.toFixed(1)} />
        <Bar label="FIRST-SEGMENT LATENCY" value={firstSeg} unit="ms" color="#2563eb" limit={fsLimit}
          ticks={[fsLimit / 2, fsLimit]} fmt={(v) => v.toFixed(0)} />
      </div>
      <div>
        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Transcript</div>
        <div className="text-sm text-gray-800 whitespace-pre-wrap max-h-48 overflow-auto border rounded p-3 bg-white"
          data-testid="stt-analysis-transcript">
          {text || <span className="text-gray-400 italic">No speech transcribed</span>}
        </div>
      </div>
    </section>
  );
}
