import type { HardwareSnapshot } from "../../shared/ipc/compare/hardware";

export const GIB = 1024 ** 3;

/// The default allocation cap from detected hardware: unified-memory total on
/// Apple Silicon (no separate VRAM pool), discrete VRAM on NVIDIA, else system
/// RAM. `null` when nothing was detected (fit then stays unmeasured).
export function defaultCapBytes(hw: HardwareSnapshot | null): number | null {
  if (!hw) return null;
  if (hw.gpu?.unified) return hw.total_memory_bytes || null;
  if (hw.gpu?.vram_total_bytes) return hw.gpu.vram_total_bytes;
  return hw.total_memory_bytes || null;
}

/// Cap dropdown options (GiB), always including the detected default so the
/// initial value is selectable. Sorted ascending.
export function capOptions(detectedBytes: number | null): { bytes: number; label: string }[] {
  const gibs = [8, 12, 16, 24, 32, 48, 64, 96, 128];
  const bytes = new Set(gibs.map((g) => g * GIB));
  if (detectedBytes && detectedBytes > 0) bytes.add(detectedBytes);
  return [...bytes].sort((a, b) => a - b).map((b) => ({ bytes: b, label: `${Math.round(b / GIB)} GB` }));
}

/// One-line architecture label for the panel — UMA vs discrete vs CPU-only.
export function archLabel(hw: HardwareSnapshot | null): string {
  if (hw?.gpu?.unified) return "Apple Silicon — Unified Memory (UMA)";
  if (hw?.gpu?.available) return `${hw.gpu.name ?? "Discrete GPU"} (PCIe)`;
  return "CPU / system RAM (no GPU detected)";
}
