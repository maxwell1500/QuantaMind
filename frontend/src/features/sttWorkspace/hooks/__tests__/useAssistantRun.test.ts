import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { useAssistantRun } from "../useAssistantRun";
import { useAssistantResultStore } from "../../../sttInspector/state/assistantResultStore";

const handlers: Record<string, EventCallback<unknown>> = {};
const fire = (event: string, payload: unknown) =>
  handlers[event]({ event, id: 0, payload });

const DONE = {
  ttft_ms: 120,
  tokens_per_sec: 50,
  token_count: 3,
  timeline: [
    { text: "the", t_ms: 120, n: 1 },
    { text: " bike", t_ms: 140, n: 2 },
    { text: " broke", t_ms: 160, n: 3 },
  ],
  stats: { total_ms: 2400, load_ms: 800 },
};

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  vi.mocked(invoke).mockResolvedValue(undefined);
  useAssistantResultStore.getState().clear();
});

describe("useAssistantRun", () => {
  it("captures the full done payload (timeline + stats), not just summary numbers", async () => {
    const { result } = renderHook(() => useAssistantRun());
    await waitFor(() => expect(handlers["prompt-done"]).toBeDefined());

    await act(async () => {
      await result.current.run("llama3.2:1b", "summarize", undefined, {
        transcriptId: "clip-1",
        auto: true,
      });
    });
    act(() => fire("prompt-done", DONE));

    expect(result.current.status).toBe("done");
    // The rich metrics — same shape as a main-Workspace run — flow to the mirror.
    expect(result.current.metrics).toEqual(DONE);
    expect(result.current.metrics?.timeline).toHaveLength(3);
    // The pipeline-linkage store is still populated for the end-to-end one-liner.
    const a = useAssistantResultStore.getState().result;
    expect(a?.transcriptId).toBe("clip-1");
    expect(a?.auto).toBe(true);
    expect(a?.ttftMs).toBe(120);
  });

  it("ignores a done event for a run it did not start", async () => {
    const { result } = renderHook(() => useAssistantRun());
    await waitFor(() => expect(handlers["prompt-done"]).toBeDefined());

    // No run() — this belongs to the Workspace hook.
    act(() => fire("prompt-done", DONE));

    expect(result.current.status).toBe("idle");
    expect(result.current.metrics).toBeNull();
    expect(useAssistantResultStore.getState().result).toBeNull();
  });
});
