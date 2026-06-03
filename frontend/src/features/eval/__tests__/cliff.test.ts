import { describe, it, expect } from "vitest";
import { padTask, buildLadder, cliffPoint } from "../cliff";
import type { ToolTask } from "../../../shared/ipc/eval/registry";

const task: ToolTask = {
  id: "t", category: "single", prompt: "Weather in Paris?",
  tools: [{ name: "w", description: "", parameters: { type: "object", properties: {} } }],
  expected: { type: "call", name: "w", args: {} },
};

describe("cliff helpers", () => {
  it("buildLadder is ascending and starts at the unpadded baseline", () => {
    expect(buildLadder(16000, 5)).toEqual([0, 4000, 8000, 12000, 16000]);
    expect(buildLadder(100, 1)).toEqual([0]);
  });

  it("padTask grows the prompt and keeps the original instruction at the end", () => {
    const padded = padTask(task, 1000);
    expect(padded.prompt.length).toBeGreaterThan(task.prompt.length);
    expect(padded.prompt.endsWith(task.prompt)).toBe(true);
    expect(padTask(task, 0)).toBe(task); // no padding → unchanged
  });

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
});
