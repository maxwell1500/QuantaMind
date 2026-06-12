import { describe, it, expect } from "vitest";
import { buildConfidenceTimeline } from "../format/confidenceTimeline";
import type { Segment } from "../../../shared/ipc/stt/transcribe";

const seg = (p: Partial<Segment>): Segment => ({
  text: "word",
  start_secs: 0,
  end_secs: 1,
  avg_logprob: -0.2,
  no_speech_prob: 0.01,
  words: null,
  ...p,
});

describe("buildConfidenceTimeline", () => {
  it("converts avg_logprob to a 0..1 confidence at the segment midpoint", () => {
    const { bars, audioSecs } = buildConfidenceTimeline(
      [seg({ start_secs: 0, end_secs: 2, avg_logprob: -0.2 })],
      10,
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].confidence).toBeCloseTo(Math.exp(-0.2), 6); // ~0.8187
    expect(bars[0].tMid).toBe(1);
    expect(bars[0].kind).toBe("ok");
    expect(audioSecs).toBe(10); // declared duration wins
  });

  it("keeps a null-logprob segment's confidence null (a gap, never a guessed 0)", () => {
    const { bars, stats } = buildConfidenceTimeline([seg({ avg_logprob: null })], 5);
    expect(bars[0].confidence).toBeNull();
    expect(stats.measuredCount).toBe(0);
    expect(stats.meanConfidence).toBeNull();
  });

  it("flags a low-confidence segment when logprob is below the decode-failure gate", () => {
    const { bars, stats } = buildConfidenceTimeline([seg({ avg_logprob: -1.4 })], 5);
    expect(bars[0].kind).toBe("low");
    expect(stats.lowCount).toBe(1);
  });

  it("flags speech-over-silence as silenceOut (hallucination risk) and it wins over low", () => {
    const { bars, stats } = buildConfidenceTimeline(
      [seg({ avg_logprob: -1.5, no_speech_prob: 0.92, text: "ghost text" })],
      5,
    );
    expect(bars[0].kind).toBe("silenceOut"); // no_speech wins over low logprob
    expect(stats.silenceOutCount).toBe(1);
    expect(stats.lowCount).toBe(0);
  });

  it("does not flag silenceOut when the high-no-speech segment is empty text", () => {
    const { bars } = buildConfidenceTimeline([seg({ no_speech_prob: 0.95, text: "  " })], 5);
    expect(bars[0].kind).toBe("ok");
  });

  it("averages only measured confidences and counts kinds", () => {
    const { stats } = buildConfidenceTimeline(
      [
        seg({ avg_logprob: 0 }), // confidence 1.0, ok
        seg({ avg_logprob: null }), // unmeasured
        seg({ avg_logprob: -1.4 }), // low
      ],
      5,
    );
    expect(stats.measuredCount).toBe(2);
    expect(stats.meanConfidence).toBeCloseTo((1 + Math.exp(-1.4)) / 2, 6);
    expect(stats.lowCount).toBe(1);
  });

  it("falls back to the last segment end when declared duration is short", () => {
    const { audioSecs } = buildConfidenceTimeline([seg({ start_secs: 0, end_secs: 8 })], 3);
    expect(audioSecs).toBe(8);
  });

  it("returns an empty chart for no segments", () => {
    const { bars, stats } = buildConfidenceTimeline([], 0);
    expect(bars).toEqual([]);
    expect(stats.meanConfidence).toBeNull();
    expect(stats.measuredCount).toBe(0);
  });
});
