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
