import { describe, it, expect } from "vitest";
import { buildVramSegments, pickLoaded } from "../vram";
import type { LoadedModel } from "../../../../shared/ipc/system/vram";

const lm = (name: string): LoadedModel => ({ name, size_bytes: 1, size_vram_bytes: 1 });

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

describe("pickLoaded", () => {
  const byName = new Map([["phi3.5:latest", lm("phi3.5:latest")]]);
  it("matches exactly", () => {
    expect(pickLoaded(byName, "phi3.5:latest")?.name).toBe("phi3.5:latest");
  });
  it("matches a bare name against a :latest entry", () => {
    expect(pickLoaded(byName, "phi3.5")?.name).toBe("phi3.5:latest");
  });
  it("matches a :latest query against a bare entry", () => {
    const m = new Map([["mistral", lm("mistral")]]);
    expect(pickLoaded(m, "mistral:latest")?.name).toBe("mistral");
  });
  it("returns undefined when absent", () => {
    expect(pickLoaded(byName, "llama3.2:1b")).toBeUndefined();
  });
});
