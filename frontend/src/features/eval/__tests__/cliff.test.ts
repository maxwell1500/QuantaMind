import { describe, it, expect } from "vitest";
import { cliffPoint, classifyCliff } from "../cliff";

// The padding ladder + needle sweep + verify-and-adjust now live in the backend
// engine (`inference/eval/cliff/`, tested in Rust); the frontend only classifies the
// verified series the backend returns. These cover that classification.
describe("cliff helpers", () => {
  it("cliffPoint reports the cliff rung's REAL measured token depth (baseline = rung 0)", () => {
    const points = [
      { promptTokens: 120, composite: 1.0 },
      { promptTokens: 4200, composite: 0.95 },
      { promptTokens: 8300, composite: 0.5 },
      { promptTokens: 12400, composite: 0.4 },
    ];
    expect(cliffPoint(points)).toBe(8300); // measured depth of the first collapsing rung
    expect(cliffPoint([{ promptTokens: 120, composite: 0.9 }, { promptTokens: 8300, composite: 0.88 }])).toBeNull();
    // No baseline accuracy (rung 0 errored) → null, never a guessed cliff.
    expect(cliffPoint([{ promptTokens: null, composite: null }, { promptTokens: 8300, composite: 0.1 }])).toBeNull();
  });

  it("uses a 20pp threshold: an 18pp drop is not a cliff, a 22pp drop is", () => {
    const base = { promptTokens: 100, composite: 1.0 };
    expect(cliffPoint([base, { promptTokens: 8300, composite: 0.82 }])).toBeNull(); // 18pp < 20pp
    expect(cliffPoint([base, { promptTokens: 8300, composite: 0.78 }])).toBe(8300); // 22pp ≥ 20pp
  });

  it("classifyCliff: a sub-threshold baseline is 'broken-baseline', NOT 'no cliff'", () => {
    // The reported real bug: every rung at 0% accuracy. Old logic saw no *drop*
    // from the (already-zero) baseline and called it "no cliff". It must instead
    // be flagged as broken from the start.
    const allZero = [
      { promptTokens: 388, composite: 0.0 },
      { promptTokens: 4030, composite: 0.0 },
    ];
    expect(classifyCliff(allZero)).toEqual({ kind: "broken-baseline", baseline: 0.0 });
    expect(cliffPoint(allZero)).toBeNull(); // still no depth to persist

    // A baseline below the 0.5 pass bar is broken even if a later rung "improves".
    expect(classifyCliff([{ promptTokens: 120, composite: 0.4 }, { promptTokens: 4000, composite: 0.4 }]))
      .toEqual({ kind: "broken-baseline", baseline: 0.4 });
  });

  it("classifyCliff: healthy baseline → 'no-cliff' when it holds, 'cliff' when it collapses", () => {
    const base = { promptTokens: 120, composite: 1.0 };
    expect(classifyCliff([base, { promptTokens: 8300, composite: 0.95 }])).toEqual({ kind: "no-cliff" });
    expect(classifyCliff([base, { promptTokens: 8300, composite: 0.5 }])).toEqual({ kind: "cliff", depth: 8300 });
  });

  it("classifyCliff: an errored rung 0 is 'no-baseline' (can't assess)", () => {
    expect(classifyCliff([{ promptTokens: null, composite: null }, { promptTokens: 8300, composite: 0.1 }]))
      .toEqual({ kind: "no-baseline" });
  });
});
