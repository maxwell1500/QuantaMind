import type { LoadedModel } from "../../../shared/ipc/system/vram";
import { formatBytes } from "../../../shared/format/bytes";
import { vramUsage } from "../format/vram";

/// Per-model memory bar: the model's resident footprint as a share of the
/// device memory pool (unified RAM on Apple, VRAM total on NVIDIA). No entry →
/// not available (model unloaded / non-Ollama backend); offload-to-RAM is noted
/// in the caption. Never fabricates a weights/KV split or a free-VRAM figure.
export function VramBar({ entry, deviceTotalBytes, unified }: {
  entry?: LoadedModel;
  deviceTotalBytes?: number | null;
  unified?: boolean;
}) {
  if (!entry) {
    return (
      <div className="text-xs text-gray-400" data-testid="vram-na">
        VRAM not available (model not loaded or non-Ollama backend)
      </div>
    );
  }
  const u = vramUsage(entry.size_bytes, entry.size_vram_bytes, deviceTotalBytes);
  const where = unified ? "in unified memory" : "in VRAM";
  const ctx = entry.context_length;
  const tip = ctx ? `Full ${ctx}-token KV cache is preallocated into memory at load` : undefined;
  return (
    <div className="space-y-1" data-testid="vram-bar" title={tip}>
      <div className="flex h-3 w-full overflow-hidden rounded bg-gray-100">
        <div data-testid="vram-seg-used" style={{ width: `${u.pct}%`, background: "#059669" }} />
      </div>
      <div className="text-[11px] text-gray-500">
        {formatBytes(u.usedBytes)} {where} of {formatBytes(u.totalBytes)} ({u.pct.toFixed(0)}%)
        {u.offloadBytes > 0 ? ` · ${formatBytes(u.offloadBytes)} offloaded to RAM` : ""}
        {ctx ? ` · ${ctx} ctx` : ""}
      </div>
    </div>
  );
}
