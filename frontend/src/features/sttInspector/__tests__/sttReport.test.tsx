import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { invokeMock, saveMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), saveMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }));

import { toSttMarkdown, toSttJson } from "../format/sttReport";
import { SttExportButtons } from "../components/SttExportButtons";
import { useSttResultStore } from "../state/sttResultStore";
import type { Transcript } from "../../../shared/ipc/stt/transcribe";

const TRANSCRIPT: Transcript = {
  id: "clip-1",
  model: "ggml-tiny.en.bin",
  language: "en",
  audio: { sample_rate_hz: 16000, channels: 1, duration_secs: 6 },
  segments: [
    { text: "hello there world", start_secs: 0, end_secs: 2, avg_logprob: -0.2, no_speech_prob: 0.01, words: null },
    { text: "this is four words", start_secs: 2, end_secs: 4, avg_logprob: -0.3, no_speech_prob: 0.01, words: null },
  ],
  complete: true,
  stats: {
    source_duration_secs: 6,
    audio_decoded_secs: 6,
    transcribe_wall_ms: 2500,
    segment_count: 2,
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

const BLANK: Transcript = {
  ...TRANSCRIPT,
  segments: [],
  stats: {
    source_duration_secs: null, audio_decoded_secs: null, transcribe_wall_ms: null,
    segment_count: null, detected_language: null, received_sample_rate_hz: null, rtf: null,
  },
  stt_profile: null,
};

beforeEach(() => {
  invokeMock.mockReset();
  saveMock.mockReset();
  useSttResultStore.setState({ result: TRANSCRIPT });
});

describe("toSttMarkdown / toSttJson", () => {
  it("renders measured metrics that match the transcript", () => {
    const md = toSttMarkdown(TRANSCRIPT);
    expect(md).toContain("Real-time factor | 2.40×");
    expect(md).toContain("| Words | 7 |"); // 3 + 4 real words
    expect(md).toContain("Words / sec | 2.8"); // 7 / 2.5s
    expect(md).toContain("Mean confidence | 90% (low 60%)");
    expect(md).toContain("hello there world this is four words"); // transcript line
  });

  it("renders N/A for every unmeasured metric — never a guessed 0", () => {
    const md = toSttMarkdown(BLANK);
    expect(md).toContain("Real-time factor | N/A");
    expect(md).toContain("Words / sec | N/A");
    expect(md).toContain("Mean confidence | N/A");
    expect(md).toContain("VRAM | Not available for this backend");
  });

  it("JSON carries the derived metrics and raw segments", () => {
    const doc = JSON.parse(toSttJson(TRANSCRIPT));
    expect(doc.schema_version).toBe("stt-report/1.0.0");
    expect(doc.metrics.word_count).toBe(7);
    expect(doc.metrics.words_per_sec).toBeCloseTo(7 / 2.5, 6);
    expect(doc.metrics.vram_bytes).toBeNull();
    expect(doc.segments).toHaveLength(2);
  });
});

describe("SttExportButtons", () => {
  it("writes Markdown through the save_compare_report file-writer", async () => {
    saveMock.mockResolvedValue("/tmp/out.md");
    invokeMock.mockResolvedValue(undefined);
    render(<SttExportButtons />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("stt-export-md"));
    });
    const call = invokeMock.mock.calls.find((c) => c[0] === "save_compare_report");
    expect(call?.[1]).toMatchObject({ path: "/tmp/out.md", format: "md" });
    expect(call?.[1].contents).toContain("Whisper.cpp transcript report");
  });

  it("does nothing when the user cancels the save dialog", async () => {
    saveMock.mockResolvedValue(null);
    render(<SttExportButtons />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("stt-export-json"));
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
