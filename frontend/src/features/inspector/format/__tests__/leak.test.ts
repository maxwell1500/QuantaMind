import { describe, it, expect } from "vitest";
import { detectLeak } from "../leak";

const GB = 1024 ** 3;

describe("detectLeak", () => {
  it("not suspected with fewer than 5 samples", () => {
    expect(detectLeak([1 * GB, 2 * GB, 3 * GB]).suspected).toBe(false);
    expect(detectLeak([1 * GB, 2 * GB, 3 * GB]).samples).toBe(3);
  });

  it("flags a monotonic climb above the noise floor", () => {
    const v = detectLeak([1.9 * GB, 2.1 * GB, 2.5 * GB, 2.9 * GB, 3.4 * GB]);
    expect(v.suspected).toBe(true);
    expect(v.growthBytes).toBeCloseTo(1.5 * GB, -6);
  });

  it("does not flag a flat/jittery series", () => {
    expect(detectLeak([2 * GB, 2 * GB, 2.01 * GB, 1.99 * GB, 2 * GB]).suspected).toBe(false);
  });

  it("does not flag a rise below the noise floor", () => {
    // monotonic but only ~100MB total growth across the window
    const b = 2 * GB;
    expect(detectLeak([b, b + 20e6, b + 40e6, b + 60e6, b + 100e6]).suspected).toBe(false);
  });
});
