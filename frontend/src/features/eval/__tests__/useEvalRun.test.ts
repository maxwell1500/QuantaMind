import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../../shared/ipc/eval/evals", () => ({ runEvalTask: vi.fn() }));

import { runEvalTask } from "../../../shared/ipc/eval/evals";
import { useEvalRun } from "../hooks/useEvalRun";
import { useEvalStore } from "../state/evalStore";

const task = (id: string) => ({ id, category: "x", prompt: "p", scoring: {} });
const result = (id: string, passed: boolean) => ({
  task_id: id, category: "x", passed, detail: "", output: "", token_count: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  useEvalStore.setState({
    tasks: [task("a"), task("b")],
    results: {}, running: false, currentId: null, error: null,
  });
});

describe("useEvalRun", () => {
  it("runs each task sequentially and records every result", async () => {
    vi.mocked(runEvalTask).mockImplementation(async (id) => result(id, id === "a"));
    const { result: hook } = renderHook(() => useEvalRun());
    await act(async () => {
      await hook.current.run("m", "ollama");
    });
    const s = useEvalStore.getState();
    expect(Object.keys(s.results)).toEqual(["a", "b"]);
    expect(s.results["a"].passed).toBe(true);
    expect(s.results["b"].passed).toBe(false);
    expect(s.running).toBe(false);
  });

  it("stops and surfaces an error if a task fails (no fabricated scores)", async () => {
    vi.mocked(runEvalTask).mockRejectedValue(new Error("backend down"));
    const { result: hook } = renderHook(() => useEvalRun());
    await act(async () => {
      await hook.current.run("m", "ollama");
    });
    const s = useEvalStore.getState();
    expect(s.error).toBeTruthy();
    expect(s.running).toBe(false);
    expect(Object.keys(s.results)).toEqual([]);
  });
});
