import { describe, it, expect } from "vitest";
import { buildLatencyBars } from "../timeline";
import type { TokenTiming } from "../../../../shared/ipc/events/events";

const tl = (ts: number[]): TokenTiming[] =>
  ts.map((t_ms, i) => ({ text: `t${i}`, t_ms, n: i + 1 }));

describe("buildLatencyBars", () => {
  it("returns empty for an empty timeline", () => {
    const { bars, stats } = buildLatencyBars([], 0);
    expect(bars).toEqual([]);
    expect(stats).toEqual({ meanMs: 0, stdMs: 0, maxMs: 0, gapMaxMs: 0 });
  });

  it("flags the first token as TTFT using ttftMs", () => {
    const { bars } = buildLatencyBars(tl([10, 20, 30]), 10);
    expect(bars[0]).toMatchObject({ kind: "ttft", latencyMs: 10, index: 1 });
  });

  it("computes inter-token gaps as t_ms diffs", () => {
    const { bars } = buildLatencyBars(tl([10, 30, 45]), 10);
    expect(bars.map((b) => b.latencyMs)).toEqual([10, 20, 15]);
    expect(bars.slice(1).every((b) => b.kind !== "ttft")).toBe(true);
  });

  it("flags a >2σ gap as an outlier (and leaves steady ones normal)", () => {
    // eight steady 10ms gaps, then a 200ms spike -> clear outlier
    const { bars } = buildLatencyBars(tl([5, 15, 25, 35, 45, 55, 65, 75, 85, 285]), 5);
    const spike = bars[bars.length - 1];
    expect(spike.kind).toBe("outlier");
    expect(spike.latencyMs).toBe(200);
    expect(bars.slice(1, -1).every((b) => b.kind === "normal")).toBe(true);
  });

  it("flags no outliers when gaps are uniform (std 0)", () => {
    const { bars } = buildLatencyBars(tl([5, 15, 25, 35]), 5);
    expect(bars.some((b) => b.kind === "outlier")).toBe(false);
  });

  it("reports maxMs over all bars and gapMaxMs over gaps only", () => {
    const { stats } = buildLatencyBars(tl([100, 110, 130]), 100);
    expect(stats.maxMs).toBe(100); // TTFT dominates
    expect(stats.gapMaxMs).toBe(20);
  });

  it("falls back to t_ms[0] when ttftMs is null", () => {
    const { bars } = buildLatencyBars(tl([12, 24]), null);
    expect(bars[0].latencyMs).toBe(12);
  });
});
