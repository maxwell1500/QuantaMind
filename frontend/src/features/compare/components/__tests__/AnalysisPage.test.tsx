import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Isolate the container's tab-switching from the heavy tab bodies.
vi.mock("../AnalysisTab", () => ({
  AnalysisTab: () => <div data-testid="stub-analysis-body" />,
}));
vi.mock("../../../quant/components/QuantPage", () => ({
  QuantPage: () => <div data-testid="stub-quant-body" />,
}));

import { AnalysisPage } from "../AnalysisPage";

describe("AnalysisPage", () => {
  it("renders both sub-tabs in order, Analysis active by default", () => {
    render(<AnalysisPage />);
    expect(screen.getByTestId("analysis-tab-analysis")).toHaveTextContent("Analysis");
    expect(screen.getByTestId("analysis-tab-quant")).toHaveTextContent("Quant");
    expect(screen.getByTestId("analysis-tab-analysis")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("analysis-tab-quant")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("stub-analysis-body")).toBeInTheDocument();
    expect(screen.queryByTestId("stub-quant-body")).toBeNull();
  });

  it("clicking Quant shows the Quant body and hides the Analysis body", () => {
    render(<AnalysisPage />);
    fireEvent.click(screen.getByTestId("analysis-tab-quant"));
    expect(screen.getByTestId("analysis-tab-quant")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("stub-quant-body")).toBeInTheDocument();
    expect(screen.queryByTestId("stub-analysis-body")).toBeNull();
  });

  it("clicking back to Analysis restores the Analysis body", () => {
    render(<AnalysisPage />);
    fireEvent.click(screen.getByTestId("analysis-tab-quant"));
    fireEvent.click(screen.getByTestId("analysis-tab-analysis"));
    expect(screen.getByTestId("stub-analysis-body")).toBeInTheDocument();
    expect(screen.queryByTestId("stub-quant-body")).toBeNull();
  });
});
