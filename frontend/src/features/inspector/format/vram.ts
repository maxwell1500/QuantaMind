import type { LoadedModel } from "../../../shared/ipc/system/vram";

export type VramSegmentKey = "vram" | "offload";
export interface VramSegment {
  key: VramSegmentKey;
  label: string;
  bytes: number;
}
export interface VramAllocation {
  segments: VramSegment[];
  total: number;
}

/// Split a model's footprint into the VRAM-resident portion and the part
/// offloaded to system RAM. `size_vram` is clamped to `size`; zero-byte
/// segments are dropped (fully-resident → one segment). Pure.
export function buildVramSegments(sizeBytes: number, sizeVramBytes: number): VramAllocation {
  const total = Math.max(0, sizeBytes);
  const vram = Math.max(0, Math.min(sizeVramBytes, total));
  const offload = Math.max(0, total - vram);
  const segments: VramSegment[] = [];
  if (vram > 0) segments.push({ key: "vram", label: "In VRAM", bytes: vram });
  if (offload > 0) segments.push({ key: "offload", label: "Offloaded to RAM", bytes: offload });
  return { segments, total };
}

/// Look up a run's model in /api/ps results, tolerating the `:latest` tag form
/// (a run may use "phi3.5" while /api/ps reports "phi3.5:latest", or vice versa).
export function pickLoaded(
  byName: Map<string, LoadedModel>,
  model: string,
): LoadedModel | undefined {
  const base = model.replace(/:latest$/, "");
  return byName.get(model) ?? byName.get(base) ?? byName.get(`${base}:latest`);
}
