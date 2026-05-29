import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../../../../shared/ipc/models/hf_install", () => ({
  installHfGguf: vi.fn(),
  cancelHfInstall: vi.fn(),
  EVENT_HF_PROGRESS: "hf-progress",
  HfPhaseSchema: { safeParse: () => ({ success: false, error: { issues: [] } }) },
}));

import { installHfGguf } from "../../../../shared/ipc/models/hf_install";
import { useHfInstall } from "../useHfInstall";
import { useModelStore } from "../../state/modelStore";
import { useWorkspaceStore } from "../../../workspace/state/workspaceStore";

beforeEach(() => {
  vi.mocked(installHfGguf).mockReset();
  useWorkspaceStore.setState({ activeBackend: "ollama" });
  useModelStore.setState({
    downloads: {}, activeHfName: null, pullNames: {}, pendingLocalPath: null,
    activeLocalName: null, activeTab: "huggingface",
  });
});

describe("useHfInstall", () => {
  it("install() writes success entry on resolve", async () => {
    vi.mocked(installHfGguf).mockResolvedValue(undefined);
    const { result } = renderHook(() => useHfInstall());
    await act(async () => { await result.current.install("repo/x", "x.gguf", "x"); });
    expect(useModelStore.getState().downloads["x"]?.status).toBe("success");
    expect(useModelStore.getState().downloads["x"]?.percent).toBe(100);
  });

  it("forwards the active backend to the install IPC", async () => {
    vi.mocked(installHfGguf).mockResolvedValue(undefined);
    useWorkspaceStore.setState({ activeBackend: "llama_cpp" });
    const { result } = renderHook(() => useHfInstall());
    await act(async () => { await result.current.install("repo/x", "x.gguf", "x"); });
    expect(installHfGguf).toHaveBeenCalledWith("repo/x", "x.gguf", "x", "llama_cpp");
  });

  it("install() writes error entry on rejection with friendly message", async () => {
    vi.mocked(installHfGguf).mockRejectedValue({ kind: "validation", message: "boom" });
    const { result } = renderHook(() => useHfInstall());
    await act(async () => { await result.current.install("repo/x", "x.gguf", "x"); });
    expect(useModelStore.getState().downloads["x"]?.status).toBe("error");
    expect(useModelStore.getState().downloads["x"]?.error).toBe("boom");
  });

  it("install() refuses a second install while another is in flight (writes error on the new name)", async () => {
    useModelStore.setState({
      activeHfName: "first",
      downloads: { first: { id: "first", source: "huggingface", name: "first", status: "downloading", percent: 30 } },
    });
    const { result } = renderHook(() => useHfInstall());
    await act(async () => { await result.current.install("repo/two", "two.gguf", "second"); });
    expect(useModelStore.getState().downloads["second"]?.status).toBe("error");
    expect(useModelStore.getState().downloads["second"]?.error).toMatch(/Another download is in progress/);
    // first entry untouched
    expect(useModelStore.getState().downloads["first"]?.status).toBe("downloading");
    // installHfGguf never invoked
    expect(installHfGguf).not.toHaveBeenCalled();
  });
});
