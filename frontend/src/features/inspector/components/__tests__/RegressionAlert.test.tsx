import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RegressionAlert } from "../RegressionAlert";
import type { HistoryEntry } from "../../../../shared/ipc/workspace/history";

const e = (tps: number, daysAgo: number): HistoryEntry => ({
  id: Math.random().toString(), name: "", model: "m", system: "", user: "p",
  params: {}, output_preview: "", output_len: 0, token_count: 1,
  tokens_per_sec: tps, ttft_ms: 100, load_ms: 10,
  ran_at: new Date(Date.now() - daysAgo * 86400_000).toISOString(),
});

describe("RegressionAlert", () => {
  it("hidden when there is no baseline", () => {
    const { container } = render(<RegressionAlert model="m" history={[e(40, 0)]} />);
    expect(container.firstChild).toBeNull();
  });

  it("warns when the latest run is ≥20% slower", () => {
    render(<RegressionAlert model="m" history={[e(30, 0), e(40, 1), e(40, 2)]} />);
    expect(screen.getByTestId("regression-slow-m")).toHaveTextContent(/% slower/);
  });

  it("shows on-par when within baseline", () => {
    render(<RegressionAlert model="m" history={[e(39, 0), e(40, 1)]} />);
    expect(screen.getByTestId("regression-ok-m")).toBeInTheDocument();
  });
});
