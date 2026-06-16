import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { useTranscriptStore } from "../../sttWorkspace/state/transcriptStore";
import { useTranscription } from "../../sttWorkspace/hooks/useTranscription";
import { useSttResultStore } from "../state/sttResultStore";

const TRANSCRIPT = {
  id: "clip-1",
  model: "ggml-tiny.en.bin",
  language: "en",
  audio: { sample_rate_hz: 16000, channels: 1, duration_secs: 12 },
  segments: [
    { text: "hello world", start_secs: 0, end_secs: 1.2, avg_logprob: -0.2, no_speech_prob: 0.01, words: null },
  ],
  complete: true,
  stats: {
    source_duration_secs: 12,
    audio_decoded_secs: 12,
    transcribe_wall_ms: 5000,
    segment_count: 1,
    detected_language: "en",
    received_sample_rate_hz: 16000,
    rtf: 2.4,
  },
  stt_profile: {
    perf: { first_segment_ms: 180, encode_ms: null, decode_ms: null },
    behavioral: { repeat_rate: 0, confidence: { mean: 0.9, low_percentile: 0.6 }, silence_hallucination_rate: 0 },
    vram_bytes: null,
  },
};

beforeEach(() => {
  invokeMock.mockReset();
  useSttResultStore.setState({ result: null });
  useTranscriptStore.getState().reset();
});

describe("sttResultStore", () => {
  it("starts empty and accepts a finished transcript", () => {
    expect(useSttResultStore.getState().result).toBeNull();
    useSttResultStore.getState().setResult(TRANSCRIPT);
    expect(useSttResultStore.getState().result?.id).toBe("clip-1");
  });

  it("a finished transcription populates the durable store", async () => {
    invokeMock.mockResolvedValue(TRANSCRIPT);
    const { result } = renderHook(() => useTranscription());
    await act(async () => {
      await result.current.run("/tmp/clip.wav");
    });
    expect(useSttResultStore.getState().result?.stats.rtf).toBe(2.4);
  });

  it("survives the transient transcriptStore reset (durable across tab nav)", async () => {
    invokeMock.mockResolvedValue(TRANSCRIPT);
    const { result } = renderHook(() => useTranscription());
    await act(async () => {
      await result.current.run("/tmp/clip.wav");
    });
    // Leaving STT mode resets the live store; the durable result must remain.
    act(() => useTranscriptStore.getState().reset());
    expect(useTranscriptStore.getState().stats).toBeNull();
    expect(useSttResultStore.getState().result?.id).toBe("clip-1");
  });
});
