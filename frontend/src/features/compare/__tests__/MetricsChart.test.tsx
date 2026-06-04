import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricsChart } from "../components/MetricsChart";
import { useCompareStore } from "../state/compareStore";
import { newRow } from "../state/compareRow";

const done = (model: string, tps: number, ttft: number) => ({
  ...newRow(model), status: "done" as const,
  metrics: { ttft_ms: ttft, tokens_per_sec: tps, token_count: 1 },
});

beforeEach(() => useCompareStore.getState().reset());

describe("MetricsChart", () => {
  it("renders nothing with no done rows", () => {
    const { container } = render(<MetricsChart />);
    expect(container.firstChild).toBeNull();
  });

  it("shows throughput + TTFT groups with the values", () => {
    useCompareStore.setState({ rows: [done("a", 40, 100), done("b", 20, 200)] });
    render(<MetricsChart />);
    expect(screen.getByTestId("metrics-tokens_per_sec")).toHaveTextContent("40.0 tok/s");
    expect(screen.getByTestId("metrics-ttft_ms")).toHaveTextContent("200 ms");
  });

  it("never invents a 'Hardware Max' ceiling", () => {
    useCompareStore.setState({ rows: [done("a", 40, 100)] });
    render(<MetricsChart />);
    expect(screen.queryByText(/Hardware Max/i)).toBeNull();
  });

  it("shows 'Not available' (not a fake 0) when a metric is unmeasured", () => {
    const noMetrics = {
      ...newRow("z"),
      status: "done" as const,
      metrics: { ttft_ms: null, tokens_per_sec: null, token_count: 0 },
    };
    useCompareStore.setState({ rows: [noMetrics] });
    render(<MetricsChart />);
    expect(screen.getByTestId("metrics-tokens_per_sec")).toHaveTextContent("Not available");
    expect(screen.getByTestId("metrics-tokens_per_sec")).not.toHaveTextContent("0.0 tok/s");
    expect(screen.getByTestId("metrics-ttft_ms")).toHaveTextContent("Not available");
    expect(screen.getByTestId("metrics-ttft_ms")).not.toHaveTextContent("0 ms");
  });
});
