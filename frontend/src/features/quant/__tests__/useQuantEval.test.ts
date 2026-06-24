import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../../shared/ipc/eval/evals", () => ({
  listEvals: vi.fn(),
  runEvalTask: vi.fn(),
}));

import { listEvals, runEvalTask } from "../../../shared/ipc/eval/evals";
import { useQuantEval } from "../useQuantEval";
import type { QuantVariant } from "../quantPick";

const v = (name: string): QuantVariant => ({ name, quantization: "Q4_K_M", sizeBytes: 1, backend: "ollama" });
const task = (id: string) => ({ id, category: "x", prompt: "p", scoring: {} });

beforeEach(() => vi.clearAllMocks());

describe("useQuantEval", () => {
  it("marks a variant 'error' when its backend fails, not 0/total", async () => {
    vi.mocked(listEvals).mockResolvedValue([task("a"), task("b")]);
    vi.mocked(runEvalTask).mockImplementation(async (_id, model) => {
      if (model === "bad") throw new Error("backend down");
      return { task_id: "a", category: "x", passed: true, detail: "", output: "", token_count: 1 };
    });
    const { result } = renderHook(() => useQuantEval());
    await act(async () => {
      await result.current.run([v("good"), v("bad")]);
    });
    await waitFor(() => expect(result.current.scores["good"]).toEqual({ passed: 2, total: 2 }));
    expect(result.current.scores["bad"]?.error).toBe(true);
  });
});
