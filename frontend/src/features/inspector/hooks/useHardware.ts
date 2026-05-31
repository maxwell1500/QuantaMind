import { useEffect, useState } from "react";
import { getHardwareSnapshot, type HardwareSnapshot } from "../../../shared/ipc/compare/hardware";

/// Fetch the hardware snapshot once so the Inspector can scale the VRAM bar
/// against the device's memory pool. Errors degrade to null.
export function useHardware(): HardwareSnapshot | null {
  const [hw, setHw] = useState<HardwareSnapshot | null>(null);
  useEffect(() => {
    getHardwareSnapshot().then(setHw).catch(() => setHw(null));
  }, []);
  return hw;
}

/// Device memory pool total + whether it's unified, derived from a snapshot:
/// unified (Apple) → system RAM; discrete (NVIDIA) → VRAM total; else null.
export function deviceMemory(hw: HardwareSnapshot | null): { totalBytes: number | null; unified: boolean } {
  const g = hw?.gpu;
  if (g?.unified) return { totalBytes: hw?.total_memory_bytes ?? null, unified: true };
  return { totalBytes: g?.vram_total_bytes ?? null, unified: false };
}
