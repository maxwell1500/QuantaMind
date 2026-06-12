import { describe, it, expect } from "vitest";
import { regressionVerdict } from "../regression";
import type { HistoryEntry } from "../../../../shared/ipc/workspace/history";

const NOW = Date.parse("2026-05-30T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86400_000).toISOString();

const e = (tps: number, ran_at: string, user = "p", model = "m"): HistoryEntry => ({
  id: Math.random().toString(), name: "", model, system: "", user,
  params: {}, output_preview: "", output_len: 0, token_count: 1,
  tokens_per_sec: tps, ttft_ms: 100, load_ms: 10, ran_at,
});

describe("regressionVerdict", () => {
  it("insufficient with no prior runs", () => {
    expect(regressionVerdict([e(40, ago(0))], "m", NOW).status).toBe("insufficient");
  });

  it("flags slow when ≥20% below the 7-day baseline", () => {
    // current 30 vs baseline avg 40 → 25% slower
    const v = regressionVerdict([e(30, ago(0)), e(40, ago(1)), e(40, ago(2))], "m", NOW);
    expect(v.status).toBe("slow");
    expect(Math.round(v.pctSlower)).toBe(25);
    expect(v.n).toBe(2);
  });

  it("ok when within 20% of baseline", () => {
    expect(regressionVerdict([e(38, ago(0)), e(40, ago(1))], "m", NOW).status).toBe("ok");
  });

  it("excludes prior runs older than 7 days and different prompts", () => {
    const v = regressionVerdict(
      [e(30, ago(0), "p"), e(40, ago(9), "p"), e(40, ago(1), "other")],
      "m", NOW,
    );
    expect(v.status).toBe("insufficient"); // both priors excluded
  });
});
