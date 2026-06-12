import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../../../shared/ipc/models/mlx_start", () => ({
  startMlxServer: vi.fn(),
  stopMlxServer: vi.fn(),
  mlxServerStatus: vi.fn(),
}));
vi.mock("../../../../shared/ipc/core/client", () => ({ checkMlxHealth: vi.fn() }));

import { startMlxServer, mlxServerStatus } from "../../../../shared/ipc/models/mlx_start";
import { checkMlxHealth } from "../../../../shared/ipc/core/client";
import { useMlxServer } from "../useMlxServer";
import { useBackendStore } from "../../../../shared/state/backendStore";

beforeEach(() => {
  vi.clearAllMocks();
  useBackendStore.setState({ mlxHealthy: null });
  vi.mocked(checkMlxHealth).mockResolvedValue({ available: false, version: null });
});

describe("useMlxServer", () => {
  it("surfaces a not-found error without marking MLX healthy", async () => {
    vi.mocked(startMlxServer).mockResolvedValue({ status: "not_found" });
    const { result } = renderHook(() => useMlxServer());
    await act(async () => {
      await result.current.start("repo");
    });
    expect(result.current.error).toContain("mlx_lm.server not found");
    expect(result.current.starting).toBe(false);
    expect(useBackendStore.getState().mlxHealthy).toBe(false);
  });

  it("goes healthy once the health probe reports available", async () => {
    vi.mocked(startMlxServer).mockResolvedValue({ status: "started", pid: 1, port: 8083 });
    vi.mocked(checkMlxHealth).mockResolvedValue({ available: true, version: null });
    const { result } = renderHook(() => useMlxServer());
    await act(async () => {
      await result.current.start("repo");
    });
    await waitFor(() => expect(useBackendStore.getState().mlxHealthy).toBe(true));
    expect(result.current.starting).toBe(false);
  });

  it("surfaces the stderr tail when the process exits during launch", async () => {
    vi.mocked(startMlxServer).mockResolvedValue({ status: "started", pid: 1, port: 8083 });
    vi.mocked(mlxServerStatus).mockResolvedValue({
      state: "exited",
      code: 1,
      stderr_tail: "ModuleNotFoundError: No module named 'mlx'",
    });
    const { result } = renderHook(() => useMlxServer());
    await act(async () => {
      await result.current.start("repo");
    });
    await waitFor(() => expect(result.current.error).toContain("ModuleNotFoundError"));
    expect(useBackendStore.getState().mlxHealthy).toBe(false);
  });
});
