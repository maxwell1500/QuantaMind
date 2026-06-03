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

  it("assembles an agentic task from its agentic spec JSON", () => {
    const agenticJson = JSON.stringify({
      mocks: [{ call: { name: "get_weather", args: { city: "Paris" } }, response: "{}" }],
      end_state: { require_sequence: [{ tool: "get_weather", args: { city: "Paris" } }] },
      k: 5,
      max_steps: 8,
    });
    const r = validateDrafts([draft({ category: "agentic", agenticJson })]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tasks[0].category).toBe("agentic");
      expect(r.tasks[0].agentic?.k).toBe(5);
    }
  });

  it("rejects an agentic task whose end-state JSON is malformed", () => {
    const r = validateDrafts([draft({ category: "agentic", agenticJson: "{ not json" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.drafts[0].error).toContain("Agentic");
  });
});
