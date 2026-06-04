import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PerformanceMatrix } from "../components/scoreboard/PerformanceMatrix";
import { useBatchStore } from "../state/batchStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import type { BatchReport } from "../../../shared/ipc/eval/batch";

const report: BatchReport = {
  collection_id: "c",
  columns: [
    { model: "qwen", backend: "ollama", toolcall: null, agentic: { passes: 5, total_runs: 5, avg_steps: 2.4, avg_output_tokens_success: 112, top_error: "none" }, error: null },
    { model: "loopy", backend: "ollama", toolcall: null, agentic: { passes: 1, total_runs: 5, avg_steps: null, avg_output_tokens_success: null, top_error: "infinite_loop" }, error: null },
  ],
};

beforeEach(() => {
  useBatchStore.getState().reset();
  useInstalledModelsStore.setState({ list: [], status: "ready", error: null, lastRefreshedAt: 1 });
});

describe("PerformanceMatrix", () => {
  it("renders one row per model with N/A preserved, and focuses on row click", () => {
    useBatchStore.setState({ report });
    const onFocus = vi.fn();
    render(<PerformanceMatrix focusedModel="qwen" onFocusModel={onFocus} />);

    expect(screen.getByTestId("matrix-model-row-qwen")).toBeInTheDocument();
    expect(screen.getByTestId("matrix-model-row-loopy")).toHaveTextContent("N/A"); // null steps/effort

    fireEvent.click(screen.getByTestId("matrix-model-row-loopy"));
    expect(onFocus).toHaveBeenCalledWith("loopy");
  });

  it("prompts to run when there is no report yet", () => {
    render(<PerformanceMatrix focusedModel="" onFocusModel={() => {}} />);
    expect(screen.queryByTestId("performance-matrix-table")).toBeNull();
    expect(screen.getByText(/Run Batch to compare/i)).toBeInTheDocument();
  });
});
