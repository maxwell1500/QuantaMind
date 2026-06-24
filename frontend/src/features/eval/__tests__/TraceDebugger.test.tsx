import { describe, it, expect } from "vitest";
import { isErrorKind, getStepTitle, verdictLabel, verdictColor, groupStepsByRun, runPassed } from "../components/TraceDebugger";
import type { TrajectoryStep } from "../../../shared/ipc/eval/batch";

const step = (run_index: number, step_index: number, kind: TrajectoryStep["kind"]): TrajectoryStep => ({
  run_index,
  step_index,
  raw_output: "",
  injection: null,
  kind,
});

describe("isErrorKind", () => {
  it("treats turn_timeout and forbidden_call as failures (not green success)", () => {
    // The bug: a stalled/trapped turn rendered as a green "Model Output Success".
    expect(isErrorKind("turn_timeout")).toBe(true);
    expect(isErrorKind("forbidden_call")).toBe(true);
  });

  it("keeps the existing error kinds and genuine successes classified correctly", () => {
    for (const k of ["tool_error", "unknown_tool", "schema_error", "malformed_json", "hallucinated_completion", "infinite_loop"]) {
      expect(isErrorKind(k)).toBe(true);
    }
    expect(isErrorKind("tool_call")).toBe(false);
    expect(isErrorKind("end_state_reached")).toBe(false);
  });
});

describe("getStepTitle", () => {
  it("labels timeout and forbidden steps as failures, not 'Model Output Success'", () => {
    expect(getStepTitle("turn_timeout", true)).toMatch(/timeout/i);
    expect(getStepTitle("forbidden_call", true)).toMatch(/forbidden/i);
    // A real success still reads as success.
    expect(getStepTitle("unknown_kind", false)).toBe("Model Output Success");
  });
});

describe("verdictLabel", () => {
  it("names the real failure kind instead of a hardcoded 'sequence violation'", () => {
    expect(verdictLabel("malformed_json").title).toMatch(/malformed json/i);
    expect(verdictLabel("hallucinated").title).toMatch(/hallucinat/i);
    expect(verdictLabel("turn_timeout").title).toMatch(/timeout/i);
    expect(verdictLabel("forbidden_call").title).toMatch(/forbidden/i);
    expect(verdictLabel("infinite_loop").title).toMatch(/budget|loop/i);
    // None of them is the old misnomer.
    for (const k of ["malformed_json", "hallucinated", "turn_timeout", "forbidden_call", "infinite_loop"]) {
      expect(verdictLabel(k).title).not.toMatch(/sequence violation/i);
    }
  });

  it("labels reported_in_prose as a distinct wrong-channel failure, not a hallucination", () => {
    // G3: content-correct, wrong-channel — must read as its own thing, not "hallucinated".
    expect(verdictLabel("reported_in_prose").title).toMatch(/prose/i);
    expect(verdictLabel("reported_in_prose").title).not.toMatch(/hallucinat/i);
    expect(verdictLabel("reported_in_prose").detail).toMatch(/not a hallucination/i);
    // It IS a failure (renders in the trace) but TEAL, distinct from the red of a hard fail.
    expect(isErrorKind("reported_in_prose")).toBe(true);
    expect(getStepTitle("reported_in_prose", true)).toMatch(/wrong channel/i);
    expect(verdictColor("reported_in_prose")).not.toBe(verdictColor("hallucinated"));
  });
});

describe("groupStepsByRun", () => {
  it("buckets a flat multi-run trajectory into per-run groups in order", () => {
    // Two Pass^k runs concatenated into one stream — exactly what stepsByKey holds.
    const flat = [
      step(0, 0, "tool_call"),
      step(0, 1, "end_state_reached"),
      step(1, 0, "tool_call"),
      step(1, 1, "infinite_loop"),
    ];
    const groups = groupStepsByRun(flat);
    expect(groups.map((g) => g.runIndex)).toEqual([0, 1]);
    expect(groups[0].steps.map((s) => s.step_index)).toEqual([0, 1]);
    expect(groups[1].steps.map((s) => s.step_index)).toEqual([0, 1]);
  });

  it("preserves within-run order and group arrival order", () => {
    const groups = groupStepsByRun([step(2, 0, "tool_call"), step(0, 0, "tool_call"), step(2, 1, "tool_call")]);
    // Group order follows first appearance, not numeric run_index.
    expect(groups.map((g) => g.runIndex)).toEqual([2, 0]);
    expect(groups[0].steps.map((s) => s.step_index)).toEqual([0, 1]);
  });

  it("handles a single-run trajectory", () => {
    const groups = groupStepsByRun([step(0, 0, "tool_call"), step(0, 1, "end_state_reached")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].runIndex).toBe(0);
  });

  it("returns no groups for an empty trajectory", () => {
    expect(groupStepsByRun([])).toEqual([]);
  });
});

describe("runPassed", () => {
  it("passes only when the run's terminal step reached the end state", () => {
    expect(runPassed({ runIndex: 0, steps: [step(0, 0, "tool_call"), step(0, 1, "end_state_reached")] })).toBe(true);
    expect(runPassed({ runIndex: 0, steps: [step(0, 0, "tool_call"), step(0, 1, "infinite_loop")] })).toBe(false);
    // An empty (still-streaming) group is not a pass.
    expect(runPassed({ runIndex: 0, steps: [] })).toBe(false);
  });
});
