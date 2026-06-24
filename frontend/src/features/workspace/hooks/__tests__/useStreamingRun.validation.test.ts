import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  vi.mocked(invoke).mockResolvedValue(undefined);
  useWorkspaceStore.setState({ lastRunMetrics: null });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("useStreamingRun — IPC event validation (F6)", () => {
  it("rejects malformed prompt-token payload; status -> error; output untouched", async () => {
    const { result } = renderHook(() => useStreamingRun());
    await waitFor(() => expect(handlers["prompt-token"]).toBeDefined());
    await act(async () => { await result.current.start("m", "p"); });

    // text must be string; firing a number should trip the zod schema
    act(() => fire("prompt-token", { text: 123 }));

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/invalid/i);
    expect(result.current.output).toBe("");
    expect(consoleError).toHaveBeenCalled();
  });

  it("rejects malformed prompt-done payload; metrics stays null", async () => {
    const { result } = renderHook(() => useStreamingRun());
    await waitFor(() => expect(handlers["prompt-done"]).toBeDefined());
    await act(async () => { await result.current.start("m", "p"); });

    // ttft_ms must be number|null; string is invalid
    act(() =>
      fire("prompt-done", { ttft_ms: "x", tokens_per_sec: 50, token_count: 4 }),
    );

    expect(result.current.status).toBe("error");
    expect(result.current.metrics).toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });

  it("accepts well-formed prompt-done payload byte-for-byte", async () => {
    const { result } = renderHook(() => useStreamingRun());
    await waitFor(() => expect(handlers["prompt-done"]).toBeDefined());
    await act(async () => { await result.current.start("m", "p"); });

    const payload = { ttft_ms: 12, tokens_per_sec: 50.0, token_count: 4, timeline: [] };
    act(() => fire("prompt-done", payload));

    expect(result.current.status).toBe("done");
    expect(result.current.metrics).toEqual(payload);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
