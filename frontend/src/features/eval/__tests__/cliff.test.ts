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

  it("cliffPoint finds the first step dropping ≥ margin below baseline", () => {
    const points = [
      { approxTokens: 0, composite: 1.0 },
      { approxTokens: 4000, composite: 0.95 },
      { approxTokens: 8000, composite: 0.5 },
      { approxTokens: 12000, composite: 0.4 },
    ];
    expect(cliffPoint(points)).toBe(8000);
    expect(cliffPoint([{ approxTokens: 0, composite: 0.9 }, { approxTokens: 8000, composite: 0.88 }])).toBeNull();
    expect(cliffPoint([{ approxTokens: 8000, composite: 0.1 }])).toBeNull(); // no baseline
  });
});
