import { describe, it, expect } from "vitest";
import { vramUsage, pickLoaded } from "../vram";
import type { LoadedModel } from "../../../../shared/ipc/system/vram";

const lm = (name: string): LoadedModel => ({ name, size_bytes: 1, size_vram_bytes: 1 });

describe("vramUsage", () => {
  it("scales the resident footprint against device total", () => {
    const u = vramUsage(4 * 1024 ** 3, 4 * 1024 ** 3, 16 * 1024 ** 3);
    expect(u.usedBytes).toBe(4 * 1024 ** 3);
    expect(u.totalBytes).toBe(16 * 1024 ** 3);
    expect(Math.round(u.pct)).toBe(25);
    expect(u.offloadBytes).toBe(0);
  });

  it("reports offload when the model exceeds resident VRAM", () => {
    const u = vramUsage(1000, 600, 4000);
    expect(u.usedBytes).toBe(600);
    expect(u.offloadBytes).toBe(400);
    expect(Math.round(u.pct)).toBe(15);
  });

  it("falls back to model size when device total is unknown", () => {
    const u = vramUsage(1000, 1000, null);
    expect(u.totalBytes).toBe(1000);
    expect(u.pct).toBe(100);
  });

  it("clamps resident larger than size", () => {
    expect(vramUsage(1000, 5000, 4000).usedBytes).toBe(1000);
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
