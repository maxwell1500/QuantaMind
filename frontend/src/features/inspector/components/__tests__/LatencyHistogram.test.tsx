import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { LatencyHistogram } from "../LatencyHistogram";
import { buildHistogram } from "../../format/histogram";
import type { LatencyBar } from "../../format/timeline";

const bar = (latencyMs: number, kind: LatencyBar["kind"] = "normal", index = 1): LatencyBar =>
  ({ index, token: "t", latencyMs, kind });

describe("LatencyHistogram", () => {
  it("renders nothing for an empty distribution", () => {
    const { container } = render(<LatencyHistogram buckets={[]} width={300} height={90} />);
    expect(container.querySelector('[data-testid="latency-histogram"]')).toBeNull();
  });

  it("renders one bar per bucket and flags the outlier bucket", () => {
    const buckets = buildHistogram(
      [bar(0, "ttft"), bar(10), bar(10), bar(10), bar(200, "outlier")],
      5,
    );
    const { container } = render(<LatencyHistogram buckets={buckets} width={300} height={90} />);
    expect(container.querySelector('[data-testid="latency-histogram"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="hist-bar"]').length).toBe(buckets.length);
    expect(container.querySelectorAll('[data-testid="hist-bar-outlier"]').length).toBeGreaterThanOrEqual(1);
  });
});
