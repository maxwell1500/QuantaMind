import { describe, it, expect } from "vitest";
import { memoryFit, fitBadge } from "../fit";

const GB = 1024 ** 3;

describe("memoryFit", () => {
  it("fits when 1.3x size is well under available memory", () => {
    expect(memoryFit(2 * GB, 16 * GB)).toBe("fits"); // need 2.6 vs 16
  });

  it("is tight above 70% of available memory", () => {
    // avail 16GB → tight threshold 11.2GB; need = size*1.3. size 9GB → 11.7GB.
    expect(memoryFit(9 * GB, 16 * GB)).toBe("tight");
  });

  it("won't fit when 1.3x size exceeds available memory", () => {
    expect(memoryFit(40 * GB, 16 * GB)).toBe("wont-fit");
  });

  it("won't fit a real model when no memory is available", () => {
    expect(memoryFit(1 * GB, 0)).toBe("wont-fit");
    expect(memoryFit(0, 0)).toBe("fits");
  });
});

describe("fitBadge", () => {
  it("maps each verdict to label + colour", () => {
    expect(fitBadge("fits").text).toBe("Fits");
    expect(fitBadge("tight").text).toBe("Tight");
    expect(fitBadge("wont-fit").text).toBe("Won't fit");
    expect(fitBadge("wont-fit").cls).toContain("red");
  });
});
