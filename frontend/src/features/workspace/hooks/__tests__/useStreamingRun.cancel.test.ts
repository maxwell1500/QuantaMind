import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { useStreamingRun } from "../useStreamingRun";
import { useWorkspaceStore } from "../../state/workspaceStore";

const handlers: Record<string, EventCallback<unknown>> = {};
const fire = (event: string, payload: unknown) =>
  handlers[event]({ event, id: 0, payload });

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  useWorkspaceStore.setState({ status: "idle", lastRunMetrics: null });
});

describe("useStreamingRun — cancel (F12)", () => {
  it("prompt-cancelled sets distinct status; metrics stays null; partial output preserved", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() => useStreamingRun());
    await waitFor(() => expect(handlers["prompt-cancelled"]).toBeDefined());

    await act(async () => {
      await result.current.start("m", "p");
    });
    act(() => {
      fire("prompt-token", { text: "partial " });
      fire("prompt-token", { text: "output" });
      fire("prompt-cancelled", { token_count: 2 });
    });

    expect(result.current.status).toBe("cancelled");
    expect(result.current.cancelledInfo).toEqual({ token_count: 2 });
    expect(result.current.output).toBe("partial output");
    expect(result.current.metrics).toBeNull();
  });

  it("starting a new run after cancel resets cancelledInfo", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() => useStreamingRun());
    await waitFor(() => expect(handlers["prompt-cancelled"]).toBeDefined());

    await act(async () => {
      await result.current.start("m", "p");
    });
    act(() => fire("prompt-cancelled", { token_count: 3 }));
    expect(result.current.cancelledInfo).toEqual({ token_count: 3 });

    await act(async () => {
      await result.current.start("m", "p2");
    });
    expect(result.current.cancelledInfo).toBeNull();
    expect(result.current.status).toBe("running");
  });
});
