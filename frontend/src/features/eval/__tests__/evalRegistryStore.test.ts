import { describe, it, expect } from "vitest";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import type { ToolTask } from "../../../shared/ipc/eval/registry";

const task: ToolTask = {
  id: "t1",
  category: "agent_loop",
  prompt: "p",
  tools: [{ name: "x", description: "", parameters: { type: "object", properties: {} } }],
  expected: { type: "no_call" },
  agentic: { mocks: [], end_state: { require_end_state: {} }, world_state: { a: "1" } },
};

describe("evalRegistryStore.editWorldState", () => {
  it("replaces the task's world_state and marks the selection edited (fork-on-edit)", () => {
    useEvalRegistryStore.setState({ tasks: [task], edited: false });
    useEvalRegistryStore.getState().editWorldState("t1", { a: "2", b: "3" });
    const s = useEvalRegistryStore.getState();
    expect(s.edited).toBe(true);
    expect(s.tasks[0].agentic?.world_state).toEqual({ a: "2", b: "3" });
  });

  it("leaves other tasks untouched", () => {
    const other: ToolTask = { ...task, id: "t2", agentic: { ...task.agentic!, world_state: { keep: "me" } } };
    useEvalRegistryStore.setState({ tasks: [task, other], edited: false });
    useEvalRegistryStore.getState().editWorldState("t1", { a: "9" });
    expect(useEvalRegistryStore.getState().tasks[1].agentic?.world_state).toEqual({ keep: "me" });
  });
});
