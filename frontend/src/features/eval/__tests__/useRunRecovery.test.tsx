import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../../shared/ipc/eval/queue", () => ({
  checkUnfinishedRun: vi.fn(),
  resumeBatchEval: vi.fn(),
  discardRun: vi.fn(),
}));

import { checkUnfinishedRun, resumeBatchEval, discardRun } from "../../../shared/ipc/eval/queue";
import { useRunRecovery } from "../hooks/useRunRecovery";
import { useBatchStore } from "../state/batchStore";

const run = { run_id: "finance", collection_id: "finance", done: 45, total: 150 };

beforeEach(() => {
  vi.clearAllMocks();
  useBatchStore.getState().reset();
});

describe("useRunRecovery", () => {
  it("surfaces an interrupted run found on mount", async () => {
    vi.mocked(checkUnfinishedRun).mockResolvedValue(run);
    const { result } = renderHook(() => useRunRecovery());
    await waitFor(() => expect(result.current.pending).toEqual(run));
  });

  it("resume starts the run, calls resumeBatchEval, and clears the prompt", async () => {
    vi.mocked(checkUnfinishedRun).mockResolvedValue(run);
    vi.mocked(resumeBatchEval).mockResolvedValue({ collection_id: "finance", columns: [] } as never);
    const { result } = renderHook(() => useRunRecovery());
    await waitFor(() => expect(result.current.pending).toEqual(run));

    await act(async () => {
      await result.current.resume();
    });

    expect(resumeBatchEval).toHaveBeenCalledWith("finance");
    expect(useBatchStore.getState().running).toBe(true);
    expect(result.current.pending).toBeNull();
  });

  it("discard drops the log and clears the prompt", async () => {
    vi.mocked(checkUnfinishedRun).mockResolvedValue(run);
    vi.mocked(discardRun).mockResolvedValue(undefined);
    const { result } = renderHook(() => useRunRecovery());
    await waitFor(() => expect(result.current.pending).toEqual(run));

    await act(async () => {
      await result.current.discard();
    });

    expect(discardRun).toHaveBeenCalledWith("finance");
    expect(result.current.pending).toBeNull();
  });
});
