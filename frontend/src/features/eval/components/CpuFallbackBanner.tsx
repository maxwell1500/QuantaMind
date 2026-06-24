import { useEffect, useState } from "react";
import { loadedModels, type LoadedModel } from "../../../shared/ipc/system/vram";
import { useHardwareSnapshot } from "../../models/hooks/useHardwareSnapshot";
import { formatBytes } from "../../../shared/format/bytes";
import type { BackendKind } from "../../../shared/ipc/models/storage";

/// Bytes of a loaded model not resident on the accelerator (spilled to system
/// RAM) and that as a percentage. Pure.
export function cpuOffload(sizeBytes: number, sizeVramBytes: number): { cpuBytes: number; cpuPct: number } {
  const cpuBytes = Math.max(0, sizeBytes - sizeVramBytes);
  const cpuPct = sizeBytes > 0 ? Math.round((cpuBytes / sizeBytes) * 100) : 0;
  return { cpuBytes, cpuPct };
}

/// Warns when the selected model is loaded with weights off the accelerator —
/// the silent CPU fallback that quietly tanks speed (and ruins eval timings).
/// Ollama-only (data from /api/ps); shows nothing when fully resident, not
/// loaded, on another backend, or with no accelerator present — never a guess.
export function CpuFallbackBanner({ model, backend }: { model: string; backend: BackendKind }) {
  const [loaded, setLoaded] = useState<LoadedModel[]>([]);
  const { snapshot } = useHardwareSnapshot();

  useEffect(() => {
    let cancelled = false;
    loadedModels()
      .then((l) => !cancelled && setLoaded(l))
      .catch(() => !cancelled && setLoaded([]));
    return () => {
      cancelled = true;
    };
  }, [model]);

  if (backend !== "ollama" || !snapshot?.gpu?.available) return null;
  const entry = loaded.find((m) => m.name === model);
  if (!entry) return null;
  const { cpuBytes, cpuPct } = cpuOffload(entry.size_bytes, entry.size_vram_bytes);
  if (cpuBytes <= 0) return null;

  return (
    <p className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700" data-testid="cpu-fallback-banner">
      ⚠ ~{cpuPct}% of this model is on CPU — {formatBytes(cpuBytes)} of {formatBytes(entry.size_bytes)} off
      the accelerator. Inference will be slow; close other models or use a smaller quant.
    </p>
  );
}
