import { describe, it, expect } from "vitest";
import { toolcallDelta } from "../components/QuantPage";

const variants = [
  { name: "qwen:q4", quantization: "Q4_K_M" },
  { name: "qwen:q8", quantization: "Q8_0" },
];

describe("toolcallDelta", () => {
  it("computes per-quant pp delta vs the highest-quality scored quant", () => {
    const d = toolcallDelta(variants, { "qwen:q4": 0.71, "qwen:q8": 0.88 });
    expect(d.baseline).toBe("Q8_0");
    expect(d.deltas).toEqual({ "qwen:q4": -17 }); // baseline row excluded
  });

  it("returns no baseline when fewer than two quants are scored", () => {
    expect(toolcallDelta(variants, { "qwen:q4": 0.71 })).toEqual({ baseline: null, deltas: {} });
    expect(toolcallDelta(variants, {})).toEqual({ baseline: null, deltas: {} });
  });

  it("ignores quants with a null (errored) score", () => {
    const d = toolcallDelta(variants, { "qwen:q4": 0.71, "qwen:q8": null });
    expect(d.baseline).toBeNull();
  });
});
