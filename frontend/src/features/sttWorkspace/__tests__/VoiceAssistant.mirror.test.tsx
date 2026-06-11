import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { VoiceAssistant } from "../components/VoiceAssistant";
import { useTranscriptStore } from "../state/transcriptStore";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { useCompareStore } from "../../compare/state/compareStore";

const handlers: Record<string, EventCallback<unknown>> = {};
const fire = (event: string, payload: unknown) =>
  handlers[event]({ event, id: 0, payload });

const seg = (text: string) => ({
  text, start_secs: 0, end_secs: 1, avg_logprob: null, no_speech_prob: null, words: null,
});

const DONE = {
  ttft_ms: 120,
  tokens_per_sec: 50,
  token_count: 2,
  timeline: [
    { text: "bike", t_ms: 120, n: 1 },
    { text: " broke", t_ms: 150, n: 2 },
  ],
  stats: { total_ms: 2400 },
};

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
  vi.mocked(listen).mockReset().mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  useCompareStore.getState().reset();
  useSelectedModelStore.setState({ selectedModels: [{ name: "llama3.2:1b", backend: "ollama", size_bytes: 1 }] });
  useTranscriptStore.setState({ status: "done", currentId: "clip-1", segments: [seg("my bike is broken")] });
});

describe("VoiceAssistant → compareStore mirror", () => {
  it("a completed assistant run lands a rich row (timeline + stats) for the Inspector/Analysis", async () => {
    render(<VoiceAssistant />);
    await waitFor(() => expect(handlers["prompt-done"]).toBeDefined());

    await act(async () => { fireEvent.click(screen.getByTestId("stt-assistant-ask")); });
    act(() => fire("prompt-done", DONE));

    const rows = useCompareStore.getState().rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe("llama3.2:1b");
    expect(rows[0].status).toBe("done");
    // The exact per-token timeline the rich ModelTimeline charts.
    expect(rows[0].metrics?.timeline).toHaveLength(2);
    expect(rows[0].metrics?.ttft_ms).toBe(120);
    expect(rows[0].metrics?.stats?.total_ms).toBe(2400);
  });
});
