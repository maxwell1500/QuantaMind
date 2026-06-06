import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TokenTimeline } from "../TokenTimeline";
import { buildLatencyBars } from "../../format/timeline";
import type { TokenTiming } from "../../../../shared/ipc/events/events";

const tl = (ts: number[]): TokenTiming[] =>
  ts.map((t_ms, i) => ({ text: `t${i}`, t_ms, n: i + 1 }));

describe("TokenTimeline", () => {
  it("renders one bar per token, the TTFT bar, and a flagged outlier", () => {
    const { bars, stats } = buildLatencyBars(tl([5, 15, 25, 35, 45, 55, 65, 75, 85, 285]), 5);
    const { container } = render(<TokenTimeline bars={bars} stats={stats} width={400} height={120} maxTime={300} loadMs={0} prefillMs={0} ttftMs={5} />);
    expect(container.querySelector('[data-testid="token-timeline"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="bar-"]').length).toBe(bars.length);
    expect(container.querySelector('[data-testid="bar-ttft-1"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="bar-outlier-"]').length).toBe(1);
  });

  it("reports the hovered bar via onHover (full-height hit target)", () => {
    const { bars, stats } = buildLatencyBars(tl([10, 30]), 10);
    const onHover = vi.fn();
    const { container } = render(
      <TokenTimeline bars={bars} stats={stats} width={200} height={80} onHover={onHover} maxTime={30} loadMs={0} prefillMs={0} ttftMs={10} />,
    );
    fireEvent.mouseEnter(container.querySelector('[data-testid="hit-2"]')!);
    expect(onHover).toHaveBeenCalledWith(expect.objectContaining({ index: 2, latencyMs: 20, token: "t1" }));
  });
});
