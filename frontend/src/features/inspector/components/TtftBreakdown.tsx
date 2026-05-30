import type { GenerateStats } from "../../../shared/ipc/events/events";
import { buildTtftSegments, type TtftSegmentKey } from "../format/ttft";

const COLOR: Record<TtftSegmentKey, string> = {
  load: "#7c3aed", // model load
  prefill: "#2563eb", // prompt prefill
  remainder: "#9ca3af", // network + first token
};

/// Stacked horizontal bar decomposing the measured TTFT into the segments a
/// backend actually reports (load / prefill / remainder). Shows "not available"
/// rather than fabricating segments when the backend reports nothing.
export function TtftBreakdown({ ttftMs, stats }: { ttftMs: number | null; stats?: GenerateStats }) {
  const { segments, total, available, promptTokens } = buildTtftSegments(ttftMs, stats);
  if (!available) {
    return (
      <div className="text-xs text-gray-400" data-testid="ttft-na">
        TTFT breakdown not available for this backend
      </div>
    );
  }
  return (
    <div className="space-y-1" data-testid="ttft-breakdown">
      <div className="flex h-3 w-full overflow-hidden rounded bg-gray-100">
        {segments.map((s) => (
          <div
            key={s.key}
            data-testid={`ttft-seg-${s.key}`}
            title={`${s.label}: ${s.ms}ms`}
            style={{ width: `${total > 0 ? (s.ms / total) * 100 : 0}%`, background: COLOR[s.key] }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR[s.key] }} />
            {s.label} {s.ms}ms
          </span>
        ))}
        {promptTokens != null && <span>· {promptTokens} prompt tokens</span>}
      </div>
    </div>
  );
}
