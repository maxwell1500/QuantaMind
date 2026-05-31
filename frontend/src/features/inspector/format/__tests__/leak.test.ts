import { describe, it, expect } from "vitest";
import { detectLeak, type LeakSample } from "../leak";

const GB = 1024 ** 3;
const s = (rssGb: number, model = "m"): LeakSample => ({ model, rssBytes: rssGb * GB });

describe("detectLeak", () => {
  it("not suspected with fewer than 5 samples", () => {
    expect(detectLeak([s(1), s(2), s(3)]).suspected).toBe(false);
    expect(detectLeak([s(1), s(2), s(3)]).samples).toBe(3);
  });

  it("flags a same-model monotonic climb above the noise floor", () => {
    const v = detectLeak([s(1.9), s(2.1), s(2.5), s(2.9), s(3.4)]);
    expect(v.suspected).toBe(true);
    expect(v.growthBytes).toBeCloseTo(1.5 * GB, -6);
  });

  it("does NOT flag a climb caused by switching model", () => {
    const v = detectLeak([s(1.9, "a"), s(2.1, "a"), s(2.5, "b"), s(2.9, "b"), s(3.4, "b")]);
    expect(v.suspected).toBe(false);
  });

  it("does not flag a flat/jittery series", () => {
    expect(detectLeak([s(2), s(2), s(2.01), s(1.99), s(2)]).suspected).toBe(false);
  });

  it("does not flag a rise below the noise floor", () => {
    const b = 2 * GB;
    const sb = (extra: number): LeakSample => ({ model: "m", rssBytes: b + extra });
    expect(detectLeak([sb(0), sb(20e6), sb(40e6), sb(60e6), sb(100e6)]).suspected).toBe(false);
  });
});
