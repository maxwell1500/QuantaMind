import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PerformanceMatrix } from "../components/scoreboard/PerformanceMatrix";
import { useBatchStore } from "../state/batchStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import type { BatchReport } from "../../../shared/ipc/eval/batch";

const report: BatchReport = {
  collection_id: "c",
  columns: [
    { model: "qwen", backend: "ollama", toolcall: null, agentic: { passes: 5, total_runs: 5, avg_steps: 2.4, avg_output_tokens_success: 112, schema_resilience: null, top_error: "none", failures: { infinite_loop_hits: 0, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 0 } }, error: null },
    { model: "loopy", backend: "ollama", toolcall: null, agentic: { passes: 1, total_runs: 5, avg_steps: null, avg_output_tokens_success: null, schema_resilience: null, top_error: "infinite_loop", failures: { infinite_loop_hits: 4, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 0 } }, error: null },
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

    // The Driver-B/D reliability columns are present.
    expect(screen.getByRole("columnheader", { name: "Schema Resil." })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Cliff Depth" })).toBeInTheDocument();
  });

  it("offers a Run-probe link to the Audit tab when cliff depth is unmeasured", async () => {
    const { useNavStore } = await import("../../../shared/state/navStore");
    useBatchStore.setState({ report });
    render(<PerformanceMatrix focusedModel="qwen" onFocusModel={() => {}} />);

    const link = screen.getByTestId("cliff-run-qwen");
    expect(link).toHaveTextContent("Run probe");
    fireEvent.click(link);
    expect(useNavStore.getState().topView).toBe("audit");
  });

  it("prompts to run when there is no report yet", () => {
    render(<PerformanceMatrix focusedModel="" onFocusModel={() => {}} />);
    expect(screen.queryByTestId("performance-matrix-table")).toBeNull();
    expect(screen.getByText(/Run Batch to compare/i)).toBeInTheDocument();
  });

  const failures = { infinite_loop_hits: 0, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 0 };
  const nativeReport: BatchReport = {
    collection_id: "c",
    columns: [
      {
        model: "qwen",
        backend: "ollama",
        toolcall: null,
        agentic: { passes: 5, total_runs: 5, avg_steps: 2.4, avg_output_tokens_success: 112, schema_resilience: null, top_error: "none", failures },
        agentic_native_fc: { passes: 2, total_runs: 5, avg_steps: 3.0, avg_output_tokens_success: 90, schema_resilience: null, top_error: "hallucinated", failures: { ...failures, hallucinated_completions: 3 } },
        error: null,
      },
    ],
  };

  it("reveals a parallel Native-FC pass^k column behind a toggle when native was measured", () => {
    useBatchStore.setState({ report: nativeReport });
    render(<PerformanceMatrix focusedModel="qwen" onFocusModel={() => {}} />);

    // Hidden by default — prompt-based is the default view.
    expect(screen.queryByRole("columnheader", { name: "Native FC" })).toBeNull();

    fireEvent.click(screen.getByTestId("matrix-native-toggle"));
    expect(screen.getByRole("columnheader", { name: "Native FC" })).toBeInTheDocument();
    expect(screen.getByTestId("matrix-native-qwen")).toHaveTextContent("2/5"); // native pass^k
    expect(screen.getByTestId("matrix-model-row-qwen")).toHaveTextContent("5/5"); // prompt-based still there

    fireEvent.click(screen.getByTestId("matrix-native-toggle"));
    expect(screen.queryByRole("columnheader", { name: "Native FC" })).toBeNull(); // toggled back off
  });

  it("offers no Native-FC toggle when native was not measured", () => {
    useBatchStore.setState({ report });
    render(<PerformanceMatrix focusedModel="qwen" onFocusModel={() => {}} />);
    expect(screen.queryByTestId("matrix-native-toggle")).toBeNull();
  });
});
