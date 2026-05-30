import { useEffect, useState } from "react";
import { getHardwareSnapshot, type HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import { formatBytes } from "../../../shared/format/bytes";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm border-b last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-ink text-right break-all">{value}</span>
    </div>
  );
}

function gpuLabel(gpu: HardwareSnapshot["gpu"]): string {
  if (!gpu || !gpu.available) return "Not available";
  if (gpu.unified) return `${gpu.name ?? "Integrated"} · unified memory (uses system RAM)`;
  const total = gpu.vram_total_bytes != null ? ` · ${formatBytes(gpu.vram_total_bytes)}` : "";
  const free = gpu.vram_free_bytes != null ? ` (${formatBytes(gpu.vram_free_bytes)} free)` : "";
  return `${gpu.name ?? "GPU"}${total}${free}`;
}

/// Detected hardware (powers later performance recommendations). All values
/// come from the backend snapshot; unknowns render as "—"/"Not available".
export function HardwareSection() {
  const [hw, setHw] = useState<HardwareSnapshot | null>(null);
  useEffect(() => {
    getHardwareSnapshot().then(setHw).catch((e) => console.error("hardware load failed:", e));
  }, []);

  if (!hw) return <p className="text-sm text-gray-500" data-testid="hardware-loading">Loading hardware…</p>;
  return (
    <div className="max-w-xl space-y-1" data-testid="hardware-section">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Hardware</h2>
      <Row label="CPU" value={hw.cpu || "—"} />
      {hw.physical_cores != null && <Row label="Cores" value={String(hw.physical_cores)} />}
      <Row label="Memory" value={`${formatBytes(hw.total_memory_bytes)} total · ${formatBytes(hw.available_memory_bytes)} available`} />
      <Row label="GPU" value={gpuLabel(hw.gpu)} />
      <Row label="OS" value={[hw.os_name, hw.os_version].filter(Boolean).join(" ") || "—"} />
      <Row label="Architecture" value={hw.arch || "—"} />
    </div>
  );
}
