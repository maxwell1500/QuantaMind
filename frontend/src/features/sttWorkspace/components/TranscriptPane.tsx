import { useTranscriptStore } from "../state/transcriptStore";

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/// The live transcript — rendered directly from the canonical `Segment[]` shape
/// (timestamps + text), the same data that's persisted. No divergent view.
export function TranscriptPane() {
  const segments = useTranscriptStore((s) => s.segments);
  const status = useTranscriptStore((s) => s.status);
  const processed = useTranscriptStore((s) => s.processed);
  const total = useTranscriptStore((s) => s.total);
  const error = useTranscriptStore((s) => s.error);
  const reset = useTranscriptStore((s) => s.reset);

  return (
    <div className="flex flex-col gap-2 border rounded p-3 min-h-[300px]" data-testid="stt-transcript-pane">
      <div className="text-xs text-gray-500 flex items-center justify-between">
        <span>Transcript</span>
        <div className="flex items-center gap-2">
          {status === "transcribing" && (
            <span data-testid="stt-progress">{total > 0 ? `${Math.round((processed / total) * 100)}%` : "…"}</span>
          )}
          {segments.length > 0 && status !== "transcribing" && (
            <button
              type="button"
              onClick={reset}
              data-testid="stt-transcript-clear"
              className="border rounded px-1.5 py-0.5 text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {error && <div role="alert" className="text-xs text-red-600">{error}</div>}
      {segments.length === 0 && status !== "transcribing" ? (
        <p className="text-xs text-gray-400">Record or upload audio to see the transcript here.</p>
      ) : (
        <div className="flex flex-col gap-1 text-sm">
          {segments.map((seg, i) => (
            <div key={i} data-testid="stt-segment" className="flex gap-2">
              <span className="text-[10px] text-gray-400 tabular-nums shrink-0 mt-0.5">{fmt(seg.start_secs)}</span>
              <span>{seg.text.trim()}</span>
            </div>
          ))}
          {status === "transcribing" && <span className="text-xs text-gray-400">…</span>}
        </div>
      )}
    </div>
  );
}
