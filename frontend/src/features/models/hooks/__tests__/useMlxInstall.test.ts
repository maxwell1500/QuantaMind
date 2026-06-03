import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../../../../shared/ipc/models/mlx_install", () => ({ installMlxModel: vi.fn() }));
vi.mock("../../../../shared/ipc/models/hf_install", () => ({
  cancelHfInstall: vi.fn(),
  EVENT_HF_PROGRESS: "hf-progress",
}));
const refresh = vi.fn();
vi.mock("../../state/installedModelsStore", () => ({
  useInstalledModelsStore: { getState: () => ({ refresh }) },
}));

import { installMlxModel } from "../../../../shared/ipc/models/mlx_install";
import { cancelHfInstall } from "../../../../shared/ipc/models/hf_install";
import { useMlxInstall } from "../useMlxInstall";
import { useModelStore } from "../../state/modelStore";

const REPO = "mlx-community/Llama-3.2-3B-Instruct-4bit";

beforeEach(() => {
  vi.mocked(installMlxModel).mockReset();
  vi.mocked(cancelHfInstall).mockReset();
  refresh.mockReset();
  useModelStore.setState({ downloads: {}, activeHfName: null });
});

describe("useMlxInstall", () => {
  it("install() snapshots, marks success, and refreshes the installed list", async () => {
    vi.mocked(installMlxModel).mockResolvedValue(undefined);
    const { result } = renderHook(() => useMlxInstall());
    await act(async () => { await result.current.install(REPO); });
    expect(installMlxModel).toHaveBeenCalledWith(REPO);
    expect(useModelStore.getState().downloads[REPO]?.status).toBe("success");
    expect(useModelStore.getState().downloads[REPO]?.percent).toBe(100);
    expect(refresh).toHaveBeenCalled();
  });

  it("install() writes a friendly error on rejection", async () => {
    vi.mocked(installMlxModel).mockRejectedValue({ kind: "validation", message: "boom" });
    const { result } = renderHook(() => useMlxInstall());
    await act(async () => { await result.current.install(REPO); });
    expect(useModelStore.getState().downloads[REPO]?.status).toBe("error");
    expect(useModelStore.getState().downloads[REPO]?.error).toBe("boom");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses a second install while another is in flight", async () => {
    useModelStore.setState({
      activeHfName: "first",
      downloads: { first: { id: "first", source: "huggingface", name: "first", status: "downloading", percent: 30 } },
    });
    const { result } = renderHook(() => useMlxInstall());
    await act(async () => { await result.current.install(REPO); });
    expect(installMlxModel).not.toHaveBeenCalled();
    expect(useModelStore.getState().downloads[REPO]?.status).toBe("error");
  });

  it("cancel() calls the shared cancel and marks the entry cancelled", async () => {
    vi.mocked(cancelHfInstall).mockResolvedValue(undefined);
    useModelStore.setState({ activeHfName: REPO, downloads: {} });
    const { result } = renderHook(() => useMlxInstall());
    await act(async () => { await result.current.cancel(); });
    expect(cancelHfInstall).toHaveBeenCalled();
    expect(useModelStore.getState().downloads[REPO]?.status).toBe("cancelled");
  });
});
