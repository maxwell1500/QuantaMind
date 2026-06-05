import { describe, it, expect } from "vitest";
import { archLabel, capOptions, defaultCapBytes, GIB } from "../capBytes";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";

const hw = (over: Partial<HardwareSnapshot>): HardwareSnapshot => ({
  total_memory_bytes: 64 * GIB,
  available_memory_bytes: 32 * GIB,
  is_apple_silicon: false,
  ...over,
});

describe("capBytes", () => {
  it("defaults to unified memory on Apple Silicon", () => {
    expect(defaultCapBytes(hw({ is_apple_silicon: true, gpu: { unified: true, available: true } }))).toBe(64 * GIB);
  });

  it("defaults to discrete VRAM on NVIDIA", () => {
    expect(defaultCapBytes(hw({ gpu: { unified: false, available: true, vram_total_bytes: 24 * GIB } }))).toBe(24 * GIB);
  });

  it("falls back to system RAM with no GPU, null when nothing detected", () => {
    expect(defaultCapBytes(hw({}))).toBe(64 * GIB);
    expect(defaultCapBytes(null)).toBeNull();
  });

  it("capOptions always includes the detected default with a GB label", () => {
    const opts = capOptions(20 * GIB);
    expect(opts.map((o) => o.bytes)).toContain(20 * GIB);
    expect(opts.find((o) => o.bytes === 20 * GIB)?.label).toBe("20 GB");
  });

  it("archLabel distinguishes UMA / discrete / CPU", () => {
    expect(archLabel(hw({ gpu: { unified: true, available: true } }))).toMatch(/UMA/);
    expect(archLabel(hw({ gpu: { unified: false, available: true, name: "RTX 4090" } }))).toMatch(/RTX 4090/);
    expect(archLabel(hw({ gpu: { unified: false, available: false } }))).toMatch(/CPU/);
  });
});
