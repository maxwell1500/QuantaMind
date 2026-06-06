import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../../../shared/ipc/eval/batch", () => ({
  runBatchEval: vi.fn().mockResolvedValue(undefined),
  stopBatchEval: vi.fn(),
  EVENT_BATCH_PROGRESS: "batch-progress",
  EVENT_AGENTIC_STEP: "agentic-step",
  EVENT_BATCH_COMPLETE: "batch-complete",
}));
vi.mock("../../../shared/ipc/core/client", () => ({ healthFor: vi.fn() }));

import { useBatchRun } from "../hooks/useBatchRun";
import { runBatchEval } from "../../../shared/ipc/eval/batch";
import { healthFor } from "../../../shared/ipc/core/client";
import { useBatchStore } from "../state/batchStore";
import type { ModelTarget } from "../../../shared/ipc/eval/matrix";

const tasks = [
  { id: "t", category: "single", prompt: "p", tools: [{ name: "w", description: "", parameters: { type: "object", properties: {} } }], expected: { type: "call", name: "w", args: {} } },
] as never;

beforeEach(() => {
  vi.clearAllMocks();
  useBatchStore.getState().reset();
});

describe("useBatchRun pre-flight health check", () => {
  it("aborts with a clear message and never calls runBatchEval when the backend is down", async () => {
    vi.mocked(healthFor).mockResolvedValue({ available: false, version: null });
    const { result } = renderHook(() => useBatchRun());
    const targets: ModelTarget[] = [{ model: "llama3.2:1b", backend: "llama_cpp" }];

    await act(async () => { await result.current.run("c", targets, tasks, 1, 8, false); });

    expect(healthFor).toHaveBeenCalledWith("llama_cpp");
    expect(runBatchEval).not.toHaveBeenCalled();
    expect(useBatchStore.getState().error).toMatch(/llama\.cpp server isn't reachable/i);
    expect(useBatchStore.getState().running).toBe(false);
  });

  it("checks EVERY unique backend in a mixed run and aborts on the down one", async () => {
    // Ollama up, llama.cpp down → must still abort (not just check targets[0]).
    vi.mocked(healthFor).mockImplementation((b) =>
      Promise.resolve({ available: b === "ollama", version: null }),
    );
    const { result } = renderHook(() => useBatchRun());
    const targets: ModelTarget[] = [
      { model: "a", backend: "ollama" },
      { model: "b", backend: "ollama" },
      { model: "c", backend: "llama_cpp" },
    ];

    await act(async () => { await result.current.run("c", targets, tasks, 1, 8, false); });

    expect(vi.mocked(healthFor).mock.calls.map((c) => c[0])).toContain("llama_cpp");
    expect(runBatchEval).not.toHaveBeenCalled();
    expect(useBatchStore.getState().error).toMatch(/llama\.cpp server isn't reachable/i);
  });

  it("proceeds to runBatchEval when every backend is reachable", async () => {
    vi.mocked(healthFor).mockResolvedValue({ available: true, version: null });
    const { result } = renderHook(() => useBatchRun());
    const targets: ModelTarget[] = [{ model: "a", backend: "ollama" }];

    await act(async () => { await result.current.run("c", targets, tasks, 1, 8, false); });

    await waitFor(() => expect(runBatchEval).toHaveBeenCalled());
    expect(useBatchStore.getState().error).toBeNull();
  });
});
