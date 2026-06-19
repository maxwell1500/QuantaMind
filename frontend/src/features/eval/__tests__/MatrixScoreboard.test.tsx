import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MatrixScoreboard } from "../components/scoreboard/MatrixScoreboard";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useBatchStore, flushBatchBufferForTests } from "../state/batchStore";
import type { BatchProgress } from "../../../shared/ipc/eval/batch";
import type { ToolTask } from "../../../shared/ipc/eval/registry";

const MODEL = "llama3.2:3b";
const task: ToolTask = {
  id: "weather",
  category: "single",
  prompt: "p",
  tools: [{ name: "get_weather", description: "", parameters: { type: "object", properties: {} } }],
  expected: { type: "call", name: "get_weather", args: {} },
};

beforeEach(() => {
  useBatchStore.getState().reset();
  useEvalRegistryStore.setState({ tasks: [task] });
  useInstalledModelsStore.setState({
    list: [{ name: MODEL, size_bytes: 1, modified_at: "", family: "", parameter_size: "", quantization: "Q4_K_M", backend: "ollama" }],
    status: "ready",
    error: null,
    lastRefreshedAt: 1,
  });
});

describe("MatrixScoreboard (Simulator) data flow", () => {
  it("renders Pass + the aggregate from a real task_done event — not a blank '—'", () => {
    const s = useBatchStore.getState();
    s.startRun();
    s.ingestProgress({ phase: "started", model: MODEL, task_id: "weather", index: 0, total: 1, category: "single" } as BatchProgress);
    s.ingestProgress({
      phase: "done",
      model: MODEL,
      task_id: "weather",
      outcome: {
        kind: "single",
        passed: true,
        trace: {
          system_message: "sys",
          user_prompt: "u",
          raw_output: '{"name":"get_weather","args":{}}',
          verdict: { parsed: true, tool_match: true, args_match: true, abstain_correct: null },
          prompt_tokens: 10,
        },
      },
    } as BatchProgress);
    flushBatchBufferForTests();

    render(<MatrixScoreboard model={MODEL} k={1} maxSteps={8} focusedTaskId={"weather"} setFocusedTaskId={() => {}} />);

    const row = screen.getByTestId("scoreboard-row-weather");
    expect(row).toHaveTextContent("Pass"); // the Result badge renders, not a dash
    // The aggregate proves the (model,task) outcome actually landed in the store.
    expect(screen.getByTestId("matrix-scoreboard")).toHaveTextContent("100% Pass Rate");
  });

  it("shows an amber Partial badge for a k>1 agentic outcome that passed some-but-not-all runs", () => {
    const s = useBatchStore.getState();
    s.startRun();
    s.ingestProgress({ phase: "started", model: MODEL, task_id: "weather", index: 0, total: 1, category: "agentic" } as BatchProgress);
    s.ingestProgress({
      phase: "done",
      model: MODEL,
      task_id: "weather",
      outcome: {
        kind: "agentic",
        report: {
          passes: 3,
          total_runs: 5,
          avg_steps: 2.0,
          avg_output_tokens_success: 80,
          schema_resilience: null,
          top_error: "none",
          failures: { infinite_loop_hits: 0, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 0 },
        },
      },
    } as BatchProgress);
    flushBatchBufferForTests();

    render(<MatrixScoreboard model={MODEL} k={5} maxSteps={8} focusedTaskId={"weather"} setFocusedTaskId={() => {}} />);
    const result = screen.getByTestId("result-weather");
    // 3/5 is "Unreliable", not a flat Fail — aligns the badge with the Pass^k fraction.
    expect(result).toHaveTextContent("Partial 3/5");
    expect(result).not.toHaveTextContent("Fail");
  });

  it("echoes the Phase 9 run shape as header chips (Tier · K · Decoys)", () => {
    render(
      <MatrixScoreboard model={MODEL} k={16} maxSteps={8} tierLabel="Hard" decoys={3} focusedTaskId={null} setFocusedTaskId={() => {}} />,
    );
    const chips = screen.getByTestId("scoreboard-run-chips");
    expect(chips).toHaveTextContent("Tier: Hard");
    expect(chips).toHaveTextContent("K: 16");
    expect(chips).toHaveTextContent("Decoys: 3");
  });

  it("reads 'Decoys: off' when no decoy budget is set", () => {
    render(<MatrixScoreboard model={MODEL} k={8} maxSteps={8} tierLabel="Medium" focusedTaskId={null} setFocusedTaskId={() => {}} />);
    expect(screen.getByTestId("scoreboard-run-chips")).toHaveTextContent("Decoys: off");
  });

  it("collapses and expands the card, showing a 'click to expand' summary instead of blank", () => {
    render(<MatrixScoreboard model={MODEL} k={1} maxSteps={8} focusedTaskId={null} setFocusedTaskId={() => {}} />);
    // Body (the task table area / footnote) visible by default; no collapsed summary.
    expect(screen.getByTestId("matrix-scoreboard")).toHaveTextContent("AGGREGATE");
    expect(screen.queryByTestId("simulator-collapsed-summary")).toBeNull();

    fireEvent.click(screen.getByTestId("simulator-collapse"));
    // Body gone, but the header now shows a summary + an expand cue (never blank).
    expect(screen.getByTestId("matrix-scoreboard")).not.toHaveTextContent("AGGREGATE");
    expect(screen.getByTestId("simulator-collapsed-summary")).toHaveTextContent("click to expand");

    fireEvent.click(screen.getByTestId("simulator-collapse"));
    expect(screen.getByTestId("matrix-scoreboard")).toHaveTextContent("AGGREGATE"); // expands back
  });
});
