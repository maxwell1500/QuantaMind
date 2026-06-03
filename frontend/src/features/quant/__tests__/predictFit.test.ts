import { describe, it, expect } from "vitest";
import { predictFit } from "../components/QuantPage";

const GB = 1024 ** 3;

describe("predictFit", () => {
  it("fits when base + KV cache is within available memory", () => {
    const p = predictFit(4 * GB, 1 * GB, 16 * GB);
    expect(p.oom).toBe(false);
    expect(p.approx).toBe(false);
  });

  it("flags OOM when KV cache (large context) pushes total over available", () => {
    // 8 GB weights + 12 GB KV @ huge ctx = 20 GB > 16 GB → OOM Risk.
    const p = predictFit(8 * GB, 12 * GB, 16 * GB);
    expect(p.oom).toBe(true);
  });

  it("falls back to the file-size heuristic (approx) when dims/KV are unknown", () => {
    const p = predictFit(4 * GB, null, 16 * GB);
    expect(p.approx).toBe(true);
    expect(p.oom).toBe(false);
    expect(predictFit(14 * GB, null, 16 * GB).oom).toBe(true); // 14×1.3 = 18.2 GB > 16
  });
});
