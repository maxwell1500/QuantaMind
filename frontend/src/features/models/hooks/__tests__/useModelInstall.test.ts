import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { useModelInstall } from "../useModelInstall";
import { useModelStore } from "../../state/modelStore";
import { __resetDownloadEventBusForTests } from "../../state/downloadEventBus";

const handlers: Record<string, EventCallback<unknown>> = {};
const fire = (event: string, payload: unknown) =>
  handlers[event]({ event, id: 0, payload });

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  __resetDownloadEventBusForTests();
  useModelStore.setState({ downloads: {}, pullNames: {}, activeHfName: null });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

const ready = async () =>
  waitFor(() => expect(handlers["pull-progress"]).toBeDefined());

describe("useModelInstall (M.2)", () => {
  it("walks all phases ending in success; downloading carries progress", async () => {
    vi.mocked(invoke).mockResolvedValue("pid-1");
    const { result } = renderHook(() => useModelInstall("llama3.2:1b"));
    await ready();
    await act(async () => { await result.current.install("llama3.2:1b"); });
    const phases: unknown[] = [
      { phase: "pulling_manifest" },
      { phase: "downloading", digest: "sha256:abc", total: 1000, completed: 250, speed_bps: 100 },
      { phase: "verifying" }, { phase: "writing" }, { phase: "success" },
    ];
    for (const progress of phases) {
      act(() => fire("pull-progress", { pull_id: "pid-1", name: "llama3.2:1b", progress }));
    }
    expect(result.current.state.status).toBe("success");
  });

  it("ignores events from a different pull_id", async () => {
    vi.mocked(invoke).mockResolvedValue("pid-1");
    const { result } = renderHook(() => useModelInstall("x"));
    await ready();
    await act(async () => { await result.current.install("x"); });
    act(() => fire("pull-progress", { pull_id: "pid-other", name: "other", progress: { phase: "verifying" } }));
    expect(result.current.state.status).toBe("pulling");
  });

  it("rejects malformed payloads; state unchanged and console.error called", async () => {
    vi.mocked(invoke).mockResolvedValue("pid-1");
    const { result } = renderHook(() => useModelInstall("x"));
    await ready();
    await act(async () => { await result.current.install("x"); });
    act(() => fire("pull-progress", { pull_id: "pid-1", name: "x", progress: { phase: "downloading", digest: "x" } }));
    expect(result.current.state.status).toBe("pulling");
    expect(consoleError).toHaveBeenCalled();
  });

  it("cancel invokes cancel_pull with pullId; status -> cancelled", async () => {
    vi.mocked(invoke).mockResolvedValue("pid-1");
    const { result } = renderHook(() => useModelInstall("x"));
    await ready();
    await act(async () => { await result.current.install("x"); });
    await act(async () => { await result.current.cancel(); });
    expect(invoke).toHaveBeenCalledWith("cancel_pull", { pullId: "pid-1" });
    expect(result.current.state.status).toBe("cancelled");
  });

  it("unmount mid-pull does NOT cancel — download keeps running in background", async () => {
    vi.mocked(invoke).mockResolvedValue("pid-1");
    const { result, unmount } = renderHook(() => useModelInstall("x"));
    await ready();
    await act(async () => { await result.current.install("x"); });
    vi.mocked(invoke).mockClear();
    unmount();
    expect(invoke).not.toHaveBeenCalledWith("cancel_pull", { pullId: "pid-1" });
  });

  it("install rejection transitions to error with the error message", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("name has illegal char: foo bar"));
    const { result } = renderHook(() => useModelInstall("foo bar"));
    await ready();
    await act(async () => { await result.current.install("foo bar"); });
    expect(result.current.state.status).toBe("error");
    expect(result.current.state.error).toMatch(/illegal char/);
  });
});
