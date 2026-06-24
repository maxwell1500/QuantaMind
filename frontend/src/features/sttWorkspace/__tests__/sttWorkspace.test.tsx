import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, act, fireEvent } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { useTranscriptStore } from "../state/transcriptStore";
import { useMicRecorder } from "../hooks/useMicRecorder";
import { useTranscription } from "../hooks/useTranscription";
import { SttWorkspace } from "../components/SttWorkspace";
import { VoiceAssistant } from "../components/VoiceAssistant";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";

beforeEach(() => {
  invokeMock.mockReset();
  useTranscriptStore.setState({ reference: null, segments: [], status: "idle", error: null });
});

describe("transcriptStore", () => {
  it("keeps an empty reference as null, never ''", () => {
    useTranscriptStore.getState().setReference("a script");
    expect(useTranscriptStore.getState().reference).toBe("a script");
    useTranscriptStore.getState().setReference("");
    expect(useTranscriptStore.getState().reference).toBeNull();
  });
});

describe("useMicRecorder", () => {
  it("stop without record is a no-op — returns null, no throw", async () => {
    const { result } = renderHook(() => useMicRecorder());
    let res: unknown = "x";
    await act(async () => {
      res = await result.current.stop();
    });
    expect(res).toBeNull();
    expect(result.current.recording).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled(); // no-op never crosses IPC
  });

  it("start → stop drives the native commands and returns the scratch path", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "start_recording") return undefined;
      if (cmd === "stop_recording") return { path: "/scratch/take.wav", had_audio: true };
      if (cmd === "recording_level") return 0.2;
      throw new Error(`unexpected command: ${cmd}`);
    });
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.recording).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("start_recording");
    let res: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      res = await result.current.stop();
    });
    expect(res).toEqual({ path: "/scratch/take.wav", hadAudio: true });
    expect(result.current.recording).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces the backend AppError message when the mic can't start", async () => {
    invokeMock.mockRejectedValue({ kind: "validation", message: "no microphone found" });
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.recording).toBe(false);
    expect(result.current.error).toBe("no microphone found");
  });
});

describe("SttWorkspace", () => {
  it("renders the two-pane surface", () => {
    render(<SttWorkspace />);
    expect(screen.getByTestId("stt-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("stt-transcript-pane")).toBeInTheDocument();
    expect(screen.getByTestId("stt-reference-pane")).toBeInTheDocument();
  });

  it("Clear empties the transcript segments", () => {
    useTranscriptStore.setState({
      status: "done",
      segments: [
        { text: "hello", start_secs: 0, end_secs: 1, avg_logprob: null, no_speech_prob: null, words: null },
      ],
    });
    render(<SttWorkspace />);
    expect(screen.getAllByTestId("stt-segment").length).toBe(1);
    fireEvent.click(screen.getByTestId("stt-transcript-clear"));
    expect(screen.queryByTestId("stt-segment")).toBeNull();
    expect(useTranscriptStore.getState().segments).toEqual([]);
  });

  it("transcribes via the whisper.cpp transcribe_audio command", async () => {
    invokeMock.mockResolvedValue({
      id: "clip-1",
      model: "ggml-tiny.en.bin",
      language: "en",
      audio: { sample_rate_hz: 16000, channels: 1, duration_secs: 1 },
      segments: [],
      complete: true,
      stats: {
        source_duration_secs: 1,
        audio_decoded_secs: 1,
        transcribe_wall_ms: 100,
        segment_count: 0,
        detected_language: "en",
        received_sample_rate_hz: 16000,
        rtf: 10,
      },
      stt_profile: null,
    });
    const { result } = renderHook(() => useTranscription());
    await act(async () => {
      await result.current.run("/tmp/clip.wav");
    });
    const call = invokeMock.mock.calls.find((c) => c[0] === "transcribe_audio");
    expect(call?.[1]).toMatchObject({ path: "/tmp/clip.wav" });
  });
});

describe("VoiceAssistant", () => {
  const seg = (text: string) => ({
    text,
    start_secs: 0,
    end_secs: 1,
    avg_logprob: null,
    no_speech_prob: null,
    words: null,
  });

  it("sends the transcript as the prompt and the typed text as the system prompt", async () => {
    invokeMock.mockResolvedValue(undefined);
    useSelectedModelStore.setState({
      selectedModels: [{ name: "llama3.2:1b", backend: "ollama", size_bytes: 1 }],
    });
    useTranscriptStore.setState({
      status: "done",
      segments: [seg("Hi I'm Alicia, my electric bike isn't working.")],
    });

    render(<VoiceAssistant />);
    fireEvent.change(screen.getByTestId("stt-assistant-prompt"), {
      target: { value: "You are a customer support agent for Amazon ecommerce." },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("stt-assistant-ask"));
    });

    const call = invokeMock.mock.calls.find((c) => c[0] === "run_prompt");
    expect(call).toBeTruthy();
    expect(call?.[1]).toEqual({
      model: "llama3.2:1b",
      prompt: "Hi I'm Alicia, my electric bike isn't working.",
      system: "You are a customer support agent for Amazon ecommerce.",
      backend: "ollama",
    });
  });

  it("blocks asking when no model is selected", () => {
    useSelectedModelStore.setState({ selectedModels: [] });
    useTranscriptStore.setState({ status: "done", segments: [seg("hello")] });
    render(<VoiceAssistant />);
    expect(screen.getByTestId("stt-assistant-ask")).toBeDisabled();
    expect(screen.getByTestId("stt-assistant-no-model")).toBeInTheDocument();
  });

  it("auto-summarize fires the LLM on a completed transcript without a click", async () => {
    invokeMock.mockResolvedValue(undefined);
    useSelectedModelStore.setState({ selectedModels: [{ name: "llama3.2:1b", backend: "ollama", size_bytes: 1 }] });
    useTranscriptStore.setState({ status: "done", currentId: "clip-7", segments: [seg("my bike is broken")] });
    render(<VoiceAssistant />);
    expect(invokeMock).not.toHaveBeenCalledWith("run_prompt", expect.anything()); // not yet
    await act(async () => {
      fireEvent.click(screen.getByTestId("stt-auto-summarize")); // turn the auto-pipe on
    });
    const call = invokeMock.mock.calls.find((c) => c[0] === "run_prompt");
    expect(call?.[1]).toMatchObject({ model: "llama3.2:1b", prompt: "my bike is broken" });
  });
});
