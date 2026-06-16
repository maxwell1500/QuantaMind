// Wall-clock phase track for a transcription. whisper-server reports no
// model-load / encode / decode split, so the only honest phases are the latency
// to the first segment and the remaining transcription time. Colours are disjoint
// from the audio-time confidence chart.
const COLOR = { firstSeg: "#7c3aed", rest: "#16a34a" }; // violet first-segment, green transcription

/// `[ first-segment latency | rest of transcription ]` across 0 → transcribe_wall_ms.
/// The wall-time analog of the LLM TTFT breakdown. Renders an N/A note when the
/// backend reported no wall time.
export function SttPhaseBar({
  firstSegmentMs,
  wallMs,
  marginLeft = 60,
  marginRight = 90,
  width = 640,
}: {
  firstSegmentMs: number | null;
  wallMs: number | null;
  marginLeft?: number;
  marginRight?: number;
  width?: number;
}) {
  if (wallMs == null || wallMs <= 0) {
    return (
      <div className="text-xs text-gray-400 font-mono" data-testid="stt-phase-na">
        Wall-time breakdown not available for this backend
      </div>
    );
  }
  const firstMs = firstSegmentMs != null ? Math.max(0, Math.min(firstSegmentMs, wallMs)) : 0;
  const restMs = Math.max(0, wallMs - firstMs);
  const firstPct = (firstMs / wallMs) * 100;
  const restPct = (restMs / wallMs) * 100;
  const innerWidth = Math.max(0, width - marginLeft - marginRight);

  const segments = [
    { key: "firstSeg", label: "First segment", ms: firstMs, pct: firstPct },
    { key: "rest", label: "Transcription", ms: restMs, pct: restPct },
  ] as const;

  return (
    <div className="space-y-1 font-mono text-xs select-none" data-testid="stt-phase-bar">
      <div className="flex text-[10px] text-gray-500 font-semibold tracking-wider"
        style={{ marginLeft: `${marginLeft}px`, width: `${innerWidth}px` }}>
        {firstMs > 0 && (
          <div style={{ width: `${firstPct}%` }} className="truncate" title={`First segment: ${firstMs}ms`}>
            [ 1. First segment ]
          </div>
        )}
        {restMs > 0 && (
          <div style={{ width: `${restPct}%` }} className="truncate" title={`Transcription: ${restMs}ms`}>
            [ 2. Transcription ]
          </div>
        )}
      </div>
      <div className="flex items-center text-gray-500">
        <div style={{ width: `${marginLeft}px` }} className="text-right pr-2 text-[10px] font-semibold">0ms</div>
        <div className="flex h-3 overflow-hidden rounded bg-gray-100 border border-gray-400" style={{ width: `${innerWidth}px` }}>
          {segments.map((s) =>
            s.ms <= 0 ? null : (
              <div key={s.key} data-testid={`stt-phase-seg-${s.key}`} title={`${s.label}: ${s.ms}ms`}
                style={{ width: `${s.pct}%`, background: COLOR[s.key] }} />
            ),
          )}
        </div>
        <div style={{ width: `${marginRight}px` }} className="pl-2 text-[10px] font-semibold">{Math.round(wallMs)}ms</div>
      </div>
    </div>
  );
}
