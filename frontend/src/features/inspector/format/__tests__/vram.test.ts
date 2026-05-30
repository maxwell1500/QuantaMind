import { describe, it, expect } from "vitest";
import { buildVramSegments } from "../vram";

describe("buildVramSegments", () => {
  it("fully-resident model → a single in-VRAM segment", () => {
    const r = buildVramSegments(3826793472, 3826793472);
    expect(r.segments.map((s) => s.key)).toEqual(["vram"]);
    expect(r.total).toBe(3826793472);
  });

  it("partial offload → in-VRAM + offload summing to size", () => {
    const r = buildVramSegments(1000, 600);
    expect(r.segments.map((s) => s.key)).toEqual(["vram", "offload"]);
    expect(r.segments.reduce((s, x) => s + x.bytes, 0)).toBe(1000);
    expect(r.segments.find((s) => s.key === "offload")?.bytes).toBe(400);
  });

  it("size_vram 0 (100% CPU) → only an offload segment", () => {
    const r = buildVramSegments(1000, 0);
    expect(r.segments.map((s) => s.key)).toEqual(["offload"]);
  });

  it("clamps size_vram larger than size", () => {
    const r = buildVramSegments(1000, 5000);
    expect(r.segments.map((s) => s.key)).toEqual(["vram"]);
    expect(r.segments[0].bytes).toBe(1000);
  });
});
