import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

import { AnalysisTab } from "../components/AnalysisTab";
import { useCompareStore } from "../state/compareStore";

const doneRow = (model: string) => ({
  model, modelId: "u", status: "done" as const, output: `out ${model}`,
  metrics: { ttft_ms: 10, tokens_per_sec: 30, token_count: 3 },
  error: null, startedAt: "s", endedAt: "e",
});

beforeEach(() => useCompareStore.getState().reset());

describe("AnalysisTab", () => {
  it("shows an empty-state until a run has produced rows", () => {
    render(<AnalysisTab />);
    expect(screen.getByTestId("analysis-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("metrics-chart")).toBeNull();
  });

  it("renders charts + diff once two models have finished", () => {
    useCompareStore.setState({ rows: [doneRow("a"), doneRow("b")] });
    render(<AnalysisTab />);
    expect(screen.queryByTestId("analysis-empty")).toBeNull();
    // Responses on top…
    expect(screen.getByTestId("compare-output-a")).toHaveTextContent("out a");
    expect(screen.getByTestId("compare-output-b")).toHaveTextContent("out b");
    // …analysis below.
    expect(screen.getByTestId("metrics-chart")).toBeInTheDocument();
    expect(screen.getByTestId("compare-diff")).toBeInTheDocument();
  });
});
