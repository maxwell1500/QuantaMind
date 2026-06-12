import { describe, it, expect } from "vitest";
import { buildHistogram } from "../histogram";
import type { LatencyBar } from "../timeline";

const bar = (latencyMs: number, kind: LatencyBar["kind"] = "normal", index = 1): LatencyBar =>
  ({ index, token: "t", latencyMs, kind, tMs: latencyMs });

describe("buildHistogram", () => {
  it("returns [] for fewer than 2 gaps (TTFT excluded)", () => {
    expect(buildHistogram([bar(10, "ttft"), bar(20)])).toEqual([]);
  });

  it("buckets gaps and the counts sum to the gap count", () => {
    const bars = [bar(0, "ttft"), bar(10), bar(12), bar(11), bar(100)];
    const h = buildHistogram(bars, 4);
    expect(h.length).toBe(4);
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(4);
    expect(h[h.length - 1].count).toBe(1); // the 100ms spike lands in the top bin
  });

  it("flags the bucket containing an outlier gap", () => {
    const bars = [bar(0, "ttft"), bar(10), bar(10), bar(10), bar(200, "outlier")];
    const h = buildHistogram(bars, 5);
    expect(h.some((b) => b.hasOutlier)).toBe(true);
    expect(h[h.length - 1].hasOutlier).toBe(true);
  });

  it("caps bucket count at the number of gaps", () => {
    expect(buildHistogram([bar(0, "ttft"), bar(5), bar(9)], 12).length).toBe(2);
  });
});
