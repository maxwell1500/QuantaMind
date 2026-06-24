import { describe, it, expect } from "vitest";
import { buildConfidenceHistogram } from "../format/confidenceHistogram";
import type { ConfidenceBar } from "../format/confidenceTimeline";

const bar = (confidence: number | null, kind: ConfidenceBar["kind"] = "ok"): ConfidenceBar => ({
  index: 0,
  text: "x",
  tStart: 0,
  tEnd: 1,
  tMid: 0.5,
  confidence,
  noSpeechProb: 0,
  kind,
});

describe("buildConfidenceHistogram", () => {
  it("returns [] for fewer than 2 measured points", () => {
    expect(buildConfidenceHistogram([])).toEqual([]);
    expect(buildConfidenceHistogram([bar(0.9)])).toEqual([]);
    expect(buildConfidenceHistogram([bar(0.9), bar(null)])).toEqual([]); // null isn't measured
  });

  it("buckets confidences over [0,1] and places each in the right bin", () => {
    const buckets = buildConfidenceHistogram([bar(0.05), bar(0.95), bar(0.95)], 10);
    expect(buckets).toHaveLength(3); // capped at point count
    const width = 1 / 3;
    expect(buckets[0]).toMatchObject({ lo: 0, hi: width, count: 1 }); // 0.05
    expect(buckets[2].count).toBe(2); // both 0.95 in the top third
  });

  it("marks a bin holding a flagged segment", () => {
    const buckets = buildConfidenceHistogram([bar(0.1, "low"), bar(0.9), bar(0.85)], 10);
    const low = buckets.find((b) => b.count > 0 && b.lo === 0)!;
    expect(low.hasFlagged).toBe(true);
    const high = buckets.find((b) => b.lo > 0.5 && b.count > 0)!;
    expect(high.hasFlagged).toBe(false);
  });

  it("clamps a confidence of exactly 1.0 into the last bin", () => {
    const buckets = buildConfidenceHistogram([bar(1.0), bar(1.0)], 10);
    expect(buckets[buckets.length - 1].count).toBe(2);
  });
});
