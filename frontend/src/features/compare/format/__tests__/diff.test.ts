import { describe, it, expect } from "vitest";
import { diffSegments } from "../diff";

describe("diffSegments", () => {
  it("marks the shared prefix equal and the change as del+ins", () => {
    const segs = diffSegments("the cat sat", "the dog sat");
    expect(segs.some((s) => s.kind === "eq" && s.text.includes("the "))).toBe(true);
    expect(segs.some((s) => s.kind === "del" && s.text.includes("cat"))).toBe(true);
    expect(segs.some((s) => s.kind === "ins" && s.text.includes("dog"))).toBe(true);
  });

  it("identical text is all equal", () => {
    const segs = diffSegments("same", "same");
    expect(segs.every((s) => s.kind === "eq")).toBe(true);
    expect(segs.map((s) => s.text).join("")).toBe("same");
  });

  it("reconstructs `a` from eq+del and `b` from eq+ins", () => {
    const a = "hello world", b = "hello brave world";
    const segs = diffSegments(a, b);
    expect(segs.filter((s) => s.kind !== "ins").map((s) => s.text).join("")).toBe(a);
    expect(segs.filter((s) => s.kind !== "del").map((s) => s.text).join("")).toBe(b);
  });
});
