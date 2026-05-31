import { describe, it, expect } from "vitest";
import { DonePayloadSchema } from "../events/events";

const base = { ttft_ms: 12, tokens_per_sec: 50, token_count: 2 };

describe("DonePayloadSchema timeline", () => {
  it("accepts a populated timeline that round-trips", () => {
    const payload = {
      ...base,
      timeline: [
        { text: "Hi", t_ms: 12, n: 1 },
        { text: " there", t_ms: 30, n: 2 },
      ],
    };
    const r = DonePayloadSchema.safeParse(payload);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.timeline).toEqual(payload.timeline);
  });

  it("accepts an empty timeline (a zero-token run)", () => {
    const r = DonePayloadSchema.safeParse({ ...base, token_count: 0, timeline: [] });
    expect(r.success).toBe(true);
  });

  it("rejects a missing timeline", () => {
    expect(DonePayloadSchema.safeParse(base).success).toBe(false);
  });

  it("rejects bad timeline entries", () => {
    const bad = [
      { text: "x", t_ms: -1, n: 1 }, // negative t_ms
      { text: "x", t_ms: 0, n: 0 }, // n must be positive
      { t_ms: 0, n: 1 }, // missing text
    ];
    for (const entry of bad) {
      expect(DonePayloadSchema.safeParse({ ...base, timeline: [entry] }).success).toBe(false);
    }
  });
});
