import { describe, it, expect } from "vitest";
import { validateDrafts, newDraft, type TaskDraft } from "../evalDraft";

function draft(over: Partial<TaskDraft> = {}): TaskDraft {
  return { ...newDraft(), id: "t1", prompt: "Do the thing", ...over };
}

describe("validateDrafts", () => {
  it("accepts a valid draft and assembles the task", () => {
    const r = validateDrafts([draft()]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tasks).toHaveLength(1);
      expect(r.tasks[0].id).toBe("t1");
      expect(r.tasks[0].prompt).toBe("Do the thing");
    }
  });

  it("rejects an empty prompt with a friendly message", () => {
    const r = validateDrafts([draft({ prompt: "  " })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.drafts[0].error).toBe("Prompt: required");
  });

  it("rejects an empty id with a friendly message", () => {
    const r = validateDrafts([draft({ id: "" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.drafts[0].error).toBe("Task ID: required");
  });

  it("rejects an empty collection", () => {
    const r = validateDrafts([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("at least one task");
  });

  it("enforces abstain ⇔ no_call", () => {
    // category abstain but the default expected is a {type:"call"} → mismatch.
    const r = validateDrafts([draft({ category: "abstain" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.drafts[0].error).toContain("abstain");
  });

  it("rejects invalid tools JSON", () => {
    const r = validateDrafts([draft({ toolsJson: "{ not json" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.drafts[0].error).toContain("Tools");
  });

  it("assembles an agentic task from its sandbox + end-state boxes", () => {
    const mocksJson = JSON.stringify([{ call: { name: "get_weather", args: { city: "Paris" } }, response: "{}" }]);
    const endStateJson = JSON.stringify({ require_sequence: [{ tool: "get_weather", args: { city: "Paris" } }] });
    const r = validateDrafts([draft({ category: "agentic", mocksJson, endStateJson })]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tasks[0].category).toBe("agentic");
      expect(r.tasks[0].agentic?.mocks).toHaveLength(1);
      expect(r.tasks[0].agentic?.end_state).toMatchObject({ require_sequence: [{ tool: "get_weather" }] });
    }
  });

  it("rejects an agentic task whose end-state JSON is malformed", () => {
    const r = validateDrafts([draft({ category: "agentic", mocksJson: "[]", endStateJson: "{ not json" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.drafts[0].error).toContain("End-State");
  });

  it("assembles Driver-B faults + Driver-D max_recovery into the spec", () => {
    const mocksJson = JSON.stringify([{ call: { name: "get_weather", args: { city: "Paris" } }, response: "{}" }]);
    const endStateJson = JSON.stringify({ require_sequence: [{ tool: "get_weather", args: { city: "Paris" } }] });
    const faultsJson = JSON.stringify([
      { call: { name: "get_weather", args: { city: "Paris" } }, fault: { transient_error: { status_code: 503, clears_after: 1 } } },
    ]);
    const r = validateDrafts([draft({ category: "agentic", mocksJson, endStateJson, faultsJson, maxRecovery: "3" })]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tasks[0].agentic?.faults).toHaveLength(1);
      expect(r.tasks[0].agentic?.faults?.[0].fault).toMatchObject({ transient_error: { status_code: 503, clears_after: 1 } });
      expect(r.tasks[0].agentic?.max_recovery).toBe(3);
    }
  });

  it("omits faults/max_recovery when left empty (fault-free task round-trips clean)", () => {
    const mocksJson = JSON.stringify([{ call: { name: "get_weather", args: { city: "Paris" } }, response: "{}" }]);
    const endStateJson = JSON.stringify({ require_sequence: [{ tool: "get_weather", args: { city: "Paris" } }] });
    const r = validateDrafts([draft({ category: "agentic", mocksJson, endStateJson, faultsJson: "", maxRecovery: "" })]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tasks[0].agentic?.faults).toBeUndefined();
      expect(r.tasks[0].agentic?.max_recovery).toBeUndefined();
    }
  });

  it("rejects a non-integer max_recovery", () => {
    const r = validateDrafts([draft({ category: "agentic", mocksJson: "[]", maxRecovery: "-1" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.drafts[0].error).toContain("Max Recovery");
  });
});
