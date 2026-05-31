import { describe, it, expect } from "vitest";
import { timelineSvg, histogramSvg, stackedBarHtml } from "../svg";
import { buildLatencyBars } from "../../format/timeline";
import { buildHistogram } from "../../format/histogram";
import type { TokenTiming } from "../../../../shared/ipc/events/events";

const tl = (ts: number[]): TokenTiming[] => ts.map((t_ms, i) => ({ text: `t${i}`, t_ms, n: i + 1 }));

describe("report svg builders", () => {
  it("timelineSvg emits one rect per bar inside an svg", () => {
    const { bars, stats } = buildLatencyBars(tl([5, 15, 25, 35]), 5);
    const svg = timelineSvg(bars, stats);
    expect(svg.startsWith("<svg")).toBe(true);
    expect((svg.match(/<rect/g) || []).length).toBe(bars.length);
  });

  it("histogramSvg emits one rect per bucket", () => {
    const buckets = buildHistogram(buildLatencyBars(tl([5, 15, 25, 45, 200]), 5).bars, 4);
    const svg = histogramSvg(buckets);
    expect((svg.match(/<rect/g) || []).length).toBe(buckets.length);
  });

  it("timelineSvg/histogramSvg are empty for no data", () => {
    expect(timelineSvg([], { meanMs: 0, stdMs: 0, maxMs: 0, gapMaxMs: 0 })).toBe("");
    expect(histogramSvg([])).toBe("");
  });

  it("stackedBarHtml sizes segments by share of total", () => {
    const html = stackedBarHtml([{ label: "a", value: 60, color: "#000" }, { label: "b", value: 40, color: "#fff" }], 100);
    expect(html).toContain("width:60.0%");
    expect(html).toContain("width:40.0%");
  });
});
