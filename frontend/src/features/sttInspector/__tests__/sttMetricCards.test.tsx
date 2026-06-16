import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SttMetricCards } from "../components/SttMetricCards";
import { wordCount, wordsPerSec } from "../format/sttMetrics";
import type { Transcript } from "../../../shared/ipc/stt/transcribe";

const base: Transcript = {
  id: "clip-1",
  model: "ggml-tiny.en.bin",
  language: "en",
  audio: { sample_rate_hz: 16000, channels: 1, duration_secs: 60 },
  segments: [
    { text: "hello there world", start_secs: 0, end_secs: 2, avg_logprob: -0.2, no_speech_prob: 0.01, words: null },
    { text: "this is four words", start_secs: 2, end_secs: 4, avg_logprob: -0.3, no_speech_prob: 0.01, words: null },
  ],
  complete: true,
  stats: {
    source_duration_secs: 60,
    audio_decoded_secs: 60,
    transcribe_wall_ms: 25_000,
    segment_count: 12,
    detected_language: "en",
    received_sample_rate_hz: 16_000,
    rtf: 2.4,
  },
  stt_profile: {
    perf: { first_segment_ms: 180, encode_ms: null, decode_ms: null },
    behavioral: { repeat_rate: 0, confidence: { mean: 0.9, low_percentile: 0.6 }, silence_hallucination_rate: 0.1 },
    vram_bytes: null,
  },
};

describe("sttMetrics derivations", () => {
  it("counts real spoken words across segments", () => {
    expect(wordCount(base.segments)).toBe(7); // 3 + 4
  });

  it("words/sec = real words ÷ measured wall seconds", () => {
    expect(wordsPerSec(base)).toBeCloseTo(7 / 25, 6); // 25s wall
  });

  it("returns null words/sec when wall time is missing (never a fabricated 0)", () => {
    expect(wordsPerSec({ ...base, stats: { ...base.stats, transcribe_wall_ms: null } })).toBeNull();
  });
});

describe("SttMetricCards", () => {
  it("renders measured numbers", () => {
    render(<SttMetricCards transcript={base} />);
    expect(screen.getByTestId("stt-card-rtf").textContent).toBe("2.40×");
    expect(screen.getByTestId("stt-card-first-segment").textContent).toBe("180 ms");
    expect(screen.getByTestId("stt-card-wps").textContent).toBe("0.3"); // 7/25 = 0.28 → 0.3
    expect(screen.getByTestId("stt-card-segments").textContent).toBe("12");
    expect(screen.getByTestId("stt-card-confidence").textContent).toBe("90% (low 60%)");
    expect(screen.getByTestId("stt-card-repeat").textContent).toBe("0%");
    expect(screen.getByTestId("stt-card-silence").textContent).toBe("10%");
  });

  it("shows N/A for every metric the backend can't supply — never a guessed 0", () => {
    const blank: Transcript = {
      ...base,
      stats: {
        source_duration_secs: null,
        audio_decoded_secs: null,
        transcribe_wall_ms: null,
        segment_count: null,
        detected_language: null,
        received_sample_rate_hz: null,
        rtf: null,
      },
      stt_profile: null,
    };
    render(<SttMetricCards transcript={blank} />);
    expect(screen.getByTestId("stt-card-rtf-na").textContent).toBe("N/A");
    expect(screen.getByTestId("stt-card-first-segment-na").textContent).toBe("N/A");
    expect(screen.getByTestId("stt-card-wps-na").textContent).toBe("N/A");
    expect(screen.getByTestId("stt-card-confidence-na").textContent).toBe("N/A");
    expect(screen.getByTestId("stt-card-audio-na").textContent).toBe("N/A");
    expect(screen.getByTestId("stt-card-vram-na").textContent).toBe("Not available for this backend");
  });
});
