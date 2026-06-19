import { describe, it, expect } from "vitest";
import { estimateModelCalls, estimateHours, estimateLabel } from "../estimate";
import type { ToolTask } from "../../../shared/ipc/eval/registry";

const agentic = (k: number, maxSteps: number): ToolTask => ({
  id: "t",
  category: "agent_loop",
  prompt: "p",
  tools: [{ name: "x", description: "", parameters: {} }],
  expected: { type: "no_call" },
  agentic: { mocks: [], end_state: "expect_abstaining_text", k, max_steps: maxSteps },
} as unknown as ToolTask);

describe("estimateModelCalls", () => {
  it("is k × max_steps per agentic task, times models", () => {
    const tasks = [agentic(16, 40), agentic(5, 8)];
    // (16*40 + 5*8) = 680 per model; × 2 models = 1360.
    expect(estimateModelCalls(tasks, 2)).toBe(1360);
  });

  it("counts a single-turn task as one call and floors model count at 1", () => {
    const single = { ...agentic(5, 5), agentic: undefined } as ToolTask;
    expect(estimateModelCalls([single], 0)).toBe(1);
  });

  it("hours scale with calls and are 0 when tok/s is unknown", () => {
    expect(estimateHours(3600, 0)).toBe(0);
    expect(estimateHours(36000, 2000)).toBeCloseTo(1.0, 1); // 36000*200/2000/3600
  });

  it("label shows calls, and time only when tok/s is known", () => {
    const tasks = [agentic(24, 80)];
    expect(estimateLabel(tasks, 1)).toBe("~1,920 model calls");
    expect(estimateLabel(tasks, 1, 1000)).toContain("h worst-case");
  });
});
