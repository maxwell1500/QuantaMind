import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, act, fireEvent } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { useTranscriptStore } from "../state/transcriptStore";
import { useMicRecorder } from "../hooks/useMicRecorder";
import { SttWorkspace } from "../components/SttWorkspace";
import { SttProfilePanel } from "../components/SttProfilePanel";
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
  it("renders the two-pane surface for whisper.cpp", () => {
    render(<SttWorkspace engine="whisper_cpp" />);
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
    render(<SttWorkspace engine="whisper_cpp" />);
    expect(screen.getAllByTestId("stt-segment").length).toBe(1);
    fireEvent.click(screen.getByTestId("stt-transcript-clear"));
    expect(screen.queryByTestId("stt-segment")).toBeNull();
    expect(useTranscriptStore.getState().segments).toEqual([]);
  });

  it("shows the coming-later notice for mlx-audio (not the controls)", () => {
    render(<SttWorkspace engine="mlx_audio" />);
    expect(screen.getByTestId("stt-mlx-notice")).toBeInTheDocument();
    expect(screen.queryByTestId("stt-workspace")).toBeNull();
  });
});

describe("SttProfilePanel", () => {
  it("renders nothing until a run completes", () => {
    useTranscriptStore.setState({ status: "transcribing", stats: null, profile: null });
    render(<SttProfilePanel />);
    expect(screen.queryByTestId("stt-profile-panel")).toBeNull();
  });

  it("shows measured numbers and 'N/A' for what the backend can't report", () => {
    useTranscriptStore.setState({
      status: "done",
      stats: {
        source_duration_secs: 60,
        audio_decoded_secs: 60,
        transcribe_wall_ms: 25_000,
        segment_count: 12,
        detected_language: "en",
        received_sample_rate_hz: 16_000,
        rtf: 2.4,
      },
      profile: {
        perf: { first_segment_ms: 180, encode_ms: null, decode_ms: null },
        behavioral: { repeat_rate: 0, confidence: null, silence_hallucination_rate: 0.1 },
        vram_bytes: null,
      },
    });
    render(<SttProfilePanel />);
    // Measured values render as numbers.
    expect(screen.getByTestId("stt-rtf").textContent).toBe("2.40×");
    expect(screen.getByTestId("stt-first-segment").textContent).toBe("180 ms");
    expect(screen.getByTestId("stt-repeat").textContent).toBe("0%");
    expect(screen.getByTestId("stt-silence").textContent).toBe("10%");
    // What the backend can't supply renders "N/A" / a backend note — never 0 or 100%.
    expect(screen.getByTestId("stt-confidence-na").textContent).toBe("N/A");
    expect(screen.getByTestId("stt-vram-na").textContent).toBe("Not available for this backend");
    expect(screen.getByTestId("stt-split-na").textContent).toContain("N/A");
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
});
