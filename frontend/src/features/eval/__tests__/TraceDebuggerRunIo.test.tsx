import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TraceDebugger } from "../components/TraceDebugger";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useBatchStore, flushBatchBufferForTests } from "../state/batchStore";
import type { BatchProgress } from "../../../shared/ipc/eval/batch";
import type { ToolTask } from "../../../shared/ipc/eval/registry";

const MODEL = "llama3.2:3b";

const singleTask: ToolTask = {
  id: "weather",
  category: "single",
  prompt: "p",
  tools: [{ name: "get_weather", description: "", parameters: { type: "object", properties: {} } }],
  expected: { type: "call", name: "get_weather", args: {} },
};

const agenticTask: ToolTask = {
  id: "book",
  category: "agentic",
  prompt: "Book a trip.",
  tools: [{ name: "search_flights", description: "", parameters: { type: "object", properties: {} } }],
  expected: { type: "no_call" },
  agentic: { mocks: [], end_state: { require_all: [{ tool: "search_flights", args: {} }] } },
};

const agenticReport = {
  passes: 1, total_runs: 2, avg_steps: 1.5, avg_output_tokens_success: 40, schema_resilience: null, top_error: "infinite_loop",
  failures: { infinite_loop_hits: 1, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 0 },
};

beforeEach(() => {
  useBatchStore.getState().reset();
});

describe("TraceDebugger — per-run Input/Output drill-down", () => {
  it("single-turn: Input shows the captured prompt, Output shows the raw response, and they toggle", () => {
    useEvalRegistryStore.setState({ tasks: [singleTask] });
    const s = useBatchStore.getState();
    s.startRun();
    s.ingestProgress({ phase: "started", model: MODEL, task_id: "weather", index: 0, total: 1, category: "single" } as BatchProgress);
    s.ingestProgress({
      phase: "done", model: MODEL, task_id: "weather",
      outcome: { kind: "single", passed: true, trace: { system_message: "SYS-X", user_prompt: "USER-X", raw_output: "OUT-Y", verdict: { parsed: true, tool_match: true, args_match: true, abstain_correct: null } } },
    } as BatchProgress);
    flushBatchBufferForTests();

    render(<TraceDebugger model={MODEL} taskId="weather" setTaskId={() => {}} tracePass="prompt" />);
    fireEvent.click(screen.getByTestId("trace-io-input"));
    const modal = screen.getByTestId("run-io-modal");
    expect(screen.getByTestId("run-io-title")).toHaveTextContent("Single-turn run");
    expect(modal).toHaveTextContent("SYS-X");
    expect(modal).toHaveTextContent("USER-X");

    fireEvent.click(screen.getByTestId("run-io-tab-output"));
    expect(screen.getByTestId("run-io-output")).toHaveTextContent("OUT-Y");
    fireEvent.click(screen.getByTestId("run-io-tab-input"));
    expect(screen.getByTestId("run-io-input")).toHaveTextContent("SYS-X"); // round-trips
  });

  it("single-turn: an empty raw output is surfaced as 'no response', not a blank", () => {
    useEvalRegistryStore.setState({ tasks: [singleTask] });
    const s = useBatchStore.getState();
    s.startRun();
    s.ingestProgress({ phase: "started", model: MODEL, task_id: "weather", index: 0, total: 1, category: "single" } as BatchProgress);
    s.ingestProgress({
      phase: "done", model: MODEL, task_id: "weather",
      outcome: { kind: "single", passed: false, trace: { system_message: "s", user_prompt: "u", raw_output: "", verdict: { parsed: false, tool_match: false, args_match: false, abstain_correct: null } } },
    } as BatchProgress);
    flushBatchBufferForTests();

    render(<TraceDebugger model={MODEL} taskId="weather" setTaskId={() => {}} tracePass="prompt" />);
    fireEvent.click(screen.getByTestId("trace-io-output"));
    expect(screen.getByTestId("run-io-empty")).toHaveTextContent("no output");
  });

  it("agentic: each run has its own buttons; Output is scoped to that run (turns + injection + empty-turn fallback)", () => {
    useEvalRegistryStore.setState({ tasks: [agenticTask] });
    const s = useBatchStore.getState();
    s.startRun();
    s.ingestProgress({ phase: "started", model: MODEL, task_id: "book", index: 0, total: 1, category: "agentic" } as BatchProgress);
    // Run 0 — passes (ends at end_state).
    s.ingestStep({ model: MODEL, task_id: "book", run_index: 0, step_index: 0, raw_output: "RUN0-CALL", injection: '{"flights":"AA123"}', kind: "tool_call" } as never);
    s.ingestStep({ model: MODEL, task_id: "book", run_index: 0, step_index: 1, raw_output: "   ", injection: null, kind: "end_state_reached" } as never);
    // Run 1 — loops (distinct content).
    s.ingestStep({ model: MODEL, task_id: "book", run_index: 1, step_index: 0, raw_output: "RUN1-CALL", injection: null, kind: "infinite_loop" } as never);
    s.ingestProgress({ phase: "done", model: MODEL, task_id: "book", outcome: { kind: "agentic", report: agenticReport } } as BatchProgress);
    s.complete({ collection_id: "c", columns: [] } as never); // running=false → deterministic run status
    flushBatchBufferForTests();

    render(<TraceDebugger model={MODEL} taskId="book" setTaskId={() => {}} tracePass="prompt" />);

    // Open RUN 2's Output — must show only run 1's turn, titled "RUN 2 OF 2".
    fireEvent.click(screen.getByTestId("trace-io-output-1"));
    expect(screen.getByTestId("run-io-title")).toHaveTextContent("RUN 2 OF 2");
    const out1 = screen.getByTestId("run-io-output");
    expect(out1).toHaveTextContent("RUN1-CALL");
    expect(out1).not.toHaveTextContent("RUN0-CALL"); // scoped to this run only
    fireEvent.click(screen.getByTestId("run-io-close"));

    // Open RUN 1's Output — its turn + sandbox injection + the whitespace-turn fallback.
    fireEvent.click(screen.getByTestId("trace-io-output-0"));
    const out0 = screen.getByTestId("run-io-output");
    expect(out0).toHaveTextContent("RUN0-CALL");
    expect(out0).toHaveTextContent("AA123"); // injection shown
    expect(out0).toHaveTextContent("(empty output)"); // whitespace turn not a blank
    expect(out0).not.toHaveTextContent("RUN1-CALL");
  });

  it("agentic: Input reconstructs the prompt package and notes injected decoys", () => {
    useEvalRegistryStore.setState({ tasks: [agenticTask] });
    const s = useBatchStore.getState();
    s.startRun();
    s.ingestProgress({ phase: "started", model: MODEL, task_id: "book", index: 0, total: 1, category: "agentic" } as BatchProgress);
    s.ingestStep({ model: MODEL, task_id: "book", run_index: 0, step_index: 0, raw_output: "x", injection: null, kind: "end_state_reached" } as never);
    s.ingestProgress({ phase: "done", model: MODEL, task_id: "book", outcome: { kind: "agentic", report: agenticReport } } as BatchProgress);
    flushBatchBufferForTests();

    render(<TraceDebugger model={MODEL} taskId="book" setTaskId={() => {}} tracePass="prompt" decoys={3} />);
    fireEvent.click(screen.getByTestId("trace-io-input-0"));
    expect(screen.getByTestId("run-io-input")).toHaveTextContent("Constructed agentic prompt package");
    expect(screen.getByTestId("run-io-input")).toHaveTextContent("search_flights");
    expect(screen.getByTestId("run-io-input-approx")).toHaveTextContent("3 synthetic decoy tools");
  });

  it("closes via the close button, Escape, and the backdrop — but not on a content click", () => {
    useEvalRegistryStore.setState({ tasks: [singleTask] });
    const s = useBatchStore.getState();
    s.startRun();
    s.ingestProgress({ phase: "started", model: MODEL, task_id: "weather", index: 0, total: 1, category: "single" } as BatchProgress);
    s.ingestProgress({
      phase: "done", model: MODEL, task_id: "weather",
      outcome: { kind: "single", passed: true, trace: { system_message: "s", user_prompt: "u", raw_output: "o", verdict: { parsed: true, tool_match: true, args_match: true, abstain_correct: null } } },
    } as BatchProgress);
    flushBatchBufferForTests();

    render(<TraceDebugger model={MODEL} taskId="weather" setTaskId={() => {}} tracePass="prompt" />);

    fireEvent.click(screen.getByTestId("trace-io-input"));
    fireEvent.click(screen.getByTestId("run-io-close"));
    expect(screen.queryByTestId("run-io-modal")).toBeNull();

    fireEvent.click(screen.getByTestId("trace-io-input"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("run-io-modal")).toBeNull();

    fireEvent.click(screen.getByTestId("trace-io-input"));
    fireEvent.click(screen.getByTestId("run-io-tab-input")); // content click — must NOT close
    expect(screen.getByTestId("run-io-modal")).toBeTruthy();
    fireEvent.click(screen.getByTestId("run-io-modal")); // backdrop — closes
    expect(screen.queryByTestId("run-io-modal")).toBeNull();
  });
});

describe("TraceDebugger — live Tool-Calling (native) trace, native-first", () => {
  it("shows the streaming native trace even before any prompt outcome lands", () => {
    useEvalRegistryStore.setState({ tasks: [agenticTask] });
    const s = useBatchStore.getState();
    s.startRun();
    // The native pass runs FIRST: a native step streams, but NO prompt task_done has fired yet.
    s.ingestStep({
      model: MODEL, task_id: "book", run_index: 0, step_index: 0,
      raw_output: "NATIVE-CALL-XYZ", injection: "Tool result: ok", kind: "tool_call", is_native: true,
    });
    flushBatchBufferForTests();

    render(<TraceDebugger model={MODEL} taskId="book" setTaskId={() => {}} tracePass="native" />);
    // The bug: it used to show "No trace recorded" because it gated on the prompt outcome.
    expect(screen.queryByText(/No trace recorded/i)).toBeNull();
    expect(screen.getByTestId("trace-pass-label")).toHaveTextContent("Tool-Calling");
  });
});
