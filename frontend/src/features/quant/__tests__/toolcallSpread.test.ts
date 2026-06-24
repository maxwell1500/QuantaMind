import { describe, it, expect } from "vitest";
import { toolcallSpread } from "../components/QuantPage";

const variants = [
  { name: "qwen:q4", quantization: "Q4_K_M" },
  { name: "qwen:q8", quantization: "Q8_0" },
];

describe("toolcallSpread", () => {
  it("renders a one-line per-quant composite spread", () => {
    expect(toolcallSpread(variants, { "qwen:q4": 0.71, "qwen:q8": 0.88 })).toBe("Q4_K_M 71% · Q8_0 88%");
  });

  it("skips quants with no score (null or absent) — never a fabricated 0", () => {
    expect(toolcallSpread(variants, { "qwen:q4": 0.71, "qwen:q8": null })).toBe("Q4_K_M 71%");
  });

  it("returns null when nothing has run yet", () => {
    expect(toolcallSpread(variants, {})).toBeNull();
  });
});
