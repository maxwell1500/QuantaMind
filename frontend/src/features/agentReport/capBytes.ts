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

/// Cap dropdown options (GiB). Only offers caps the machine can actually back —
/// simulating a SMALLER cap is meaningful (test headroom), but offering more than
/// physical memory is not (you can't allocate 128 GB on a 16 GB box). The detected
/// total is the ceiling and is always selectable; when hardware is unknown the full
/// list is shown. Sorted ascending.
export function capOptions(detectedBytes: number | null): { bytes: number; label: string }[] {
  const gibs = [8, 12, 16, 24, 32, 48, 64, 96, 128];
  const unknown = !detectedBytes || detectedBytes <= 0;
  const bytes = new Set<number>();
  for (const g of gibs) {
    const b = g * GIB;
    if (unknown || b <= detectedBytes) bytes.add(b);
  }
  if (!unknown) bytes.add(detectedBytes); // the real ceiling, always selectable
  // Never leave the dropdown empty (e.g. < 8 GB detected): fall back to the floor.
  if (bytes.size === 0) bytes.add(gibs[0] * GIB);
  return [...bytes].sort((a, b) => a - b).map((b) => ({ bytes: b, label: `${Math.round(b / GIB)} GB` }));
}

/// One-line architecture label for the panel — UMA vs discrete vs CPU-only.
export function archLabel(hw: HardwareSnapshot | null): string {
  if (hw?.gpu?.unified) return "Apple Silicon — Unified Memory (UMA)";
  if (hw?.gpu?.available) return `${hw.gpu.name ?? "Discrete GPU"} (PCIe)`;
  return "CPU / system RAM (no GPU detected)";
}
