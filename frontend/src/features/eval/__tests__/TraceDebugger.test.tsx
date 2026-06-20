import { describe, it, expect } from "vitest";
import { isErrorKind, getStepTitle, verdictLabel, verdictColor } from "../components/TraceDebugger";

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
