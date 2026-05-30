import type { LoadedModel } from "../../../shared/ipc/system/vram";
import { formatBytes } from "../../../shared/format/bytes";
import { buildVramSegments, type VramSegmentKey } from "../format/vram";

const COLOR: Record<VramSegmentKey, string> = {
  vram: "#059669", // emerald — resident in GPU VRAM
  offload: "#9ca3af", // gray — offloaded to system RAM
};

/// Per-model VRAM allocation: In-VRAM vs offloaded-to-RAM (from Ollama
/// /api/ps). No entry → not available (model unloaded or non-Ollama backend);
/// we never fabricate a weights/KV/activations split or a free-VRAM figure.
export function VramBar({ entry }: { entry?: LoadedModel }) {
  if (!entry) {
    return (
      <div className="text-xs text-gray-400" data-testid="vram-na">
        VRAM not available (model not loaded or non-Ollama backend)
      </div>
    );
  }
  const { segments, total } = buildVramSegments(entry.size_bytes, entry.size_vram_bytes);
  const ctx = entry.context_length;
  const tip = ctx ? `Full ${ctx}-token KV cache is preallocated into VRAM at load` : undefined;
  return (
    <div className="space-y-1" data-testid="vram-bar" title={tip}>
      <div className="flex h-3 w-full overflow-hidden rounded bg-gray-100">
        {segments.map((s) => (
          <div
            key={s.key}
            data-testid={`vram-seg-${s.key}`}
            title={`${s.label}: ${formatBytes(s.bytes)}`}
            style={{ width: `${total > 0 ? (s.bytes / total) * 100 : 0}%`, background: COLOR[s.key] }}
          />
        ))}
      </div>
      <div className="text-[11px] text-gray-500">
        {formatBytes(entry.size_vram_bytes)} in VRAM of {formatBytes(entry.size_bytes)}
        {ctx ? ` · ${ctx} ctx` : ""}
      </div>
    </div>
  );
}
