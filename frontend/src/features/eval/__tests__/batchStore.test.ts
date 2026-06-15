import { beforeEach, describe, expect, it } from "vitest";
import { useBatchStore, cellKey, flushBatchBufferForTests } from "../state/batchStore";
import type { AgenticStepPayload, BatchProgress, BatchReport } from "../../../shared/ipc/eval/batch";

const get = () => useBatchStore.getState();

function step(model: string, taskId: string, i: number): AgenticStepPayload {
  return { model, task_id: taskId, run_index: 0, step_index: i, raw_output: `t${i}`, injection: null, kind: "tool_call" };
}

beforeEach(() => {
  get().reset();
});

describe("batchStore (rAF-buffered)", () => {
  it("coalesces a flood of events into a single reactive flush", () => {
    get().startRun();
    for (let i = 0; i < 500; i++) get().ingestStep(step("m1", "a1", i));

    // Nothing applied to reactive state yet — buffered, not rendered per event.
    expect(get().flushes).toBe(0);
    expect(get().stepsByKey[cellKey("m1", "a1")]).toBeUndefined();

    flushBatchBufferForTests();

    // 500 events → exactly ONE state update (≪ 500), all steps present.
    expect(get().flushes).toBe(1);
    expect(get().stepsByKey[cellKey("m1", "a1")]).toHaveLength(500);
  });

  it("routes progress + steps by (model, task) and tracks done/total", () => {
    get().startRun();
    const started: BatchProgress = { phase: "started", model: "m1", task_id: "a1", index: 0, total: 3, category: "agentic" };
    const done: BatchProgress = {
      phase: "done",
      model: "m1",
      task_id: "a1",
      outcome: {
        kind: "agentic",
        report: {
          passes: 3,
          total_runs: 5,
          failures: { infinite_loop_hits: 0, hallucinated_completions: 2, malformed_json_calls: 0, schema_unrecovered_calls: 0 },
          avg_output_tokens_success: 120,
          avg_steps: 2.4,
          top_error: "hallucinated",
          schema_resilience: null,
        },
      },
    };
    get().ingestProgress(started);
    get().ingestStep(step("m1", "a1", 0));
    get().ingestProgress(done);
    flushBatchBufferForTests();

    expect(get().progress).toEqual({ done: 1, total: 3 });
    expect(get().stepsByKey[cellKey("m1", "a1")]).toHaveLength(1);
    expect(get().outcomeByKey[cellKey("m1", "a1")]?.kind).toBe("agentic");
  });

  it("stores the final report verbatim on complete, preserving null metrics", () => {
    get().startRun();
    const report: BatchReport = {
      collection_id: "c",
      columns: [
        { model: "m1", backend: "ollama", toolcall: null, agentic: { tasks_passed: 0, tasks_total: 5, passes: 0, total_runs: 5, avg_steps: null, avg_output_tokens_success: null, schema_resilience: null, top_error: "infinite_loop", failures: { infinite_loop_hits: 5, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 0 } }, error: null },
      ],
    };
    get().complete(report);

    expect(get().running).toBe(false);
    expect(get().report?.columns[0].agentic?.avg_output_tokens_success).toBeNull();
    expect(get().report?.columns[0].agentic?.avg_steps).toBeNull();
  });

  // The QA scenario: a batch for collection A is in flight; the user switches to
  // collection B (EvalPage calls reset()). A's late `task_done`/`batch-complete`
  // events must NOT re-populate the cleared store under B.
  it("drops late events from an abandoned run after reset (no cross-collection re-pollution)", () => {
    get().startRun();
    const started: BatchProgress = { phase: "started", model: "m1", task_id: "a1", index: 0, total: 3, category: "single" };
    get().ingestProgress(started);
    // User switches collection mid-run → the store is reset (event gate closes).
    get().reset();
    // A's late in-flight events arrive a moment later — must be ignored.
    const done: BatchProgress = { phase: "done", model: "m1", task_id: "a1", outcome: { kind: "single", passed: true, trace: { system_message: "", user_prompt: "", raw_output: "", verdict: { parsed: true, tool_match: true, args_match: true, abstain_correct: null } } } };
    get().ingestProgress(done);
    get().ingestStep(step("m1", "a1", 0));
    flushBatchBufferForTests();
    expect(get().progress).toEqual({ done: 0, total: 0 });
    expect(get().outcomeByKey).toEqual({});
    expect(get().stepsByKey).toEqual({});
  });

  it("drops a batch-complete from an abandoned run (cancelled on switch)", () => {
    get().startRun();
    get().reset(); // abandoned before the report arrived
    const report: BatchReport = { collection_id: "a", columns: [{ model: "m1", backend: "ollama", toolcall: null, agentic: null, error: null }] };
    get().complete(report);
    expect(get().report).toBeNull(); // the stale report never lands
  });

  // A resume legitimately keeps streaming AFTER its partial `complete` (which flips
  // running=false) — the gate must stay open across that, unlike a guard on `running`.
  it("keeps applying live-tail events after a partial complete (resume flow)", () => {
    get().startRun();
    const partial: BatchReport = { collection_id: "a", columns: [{ model: "m1", backend: "ollama", toolcall: null, agentic: null, error: null }] };
    get().complete(partial); // partial paint → running=false, but the run continues
    expect(get().running).toBe(false);
    const done: BatchProgress = { phase: "done", model: "m1", task_id: "a1", outcome: { kind: "single", passed: true, trace: { system_message: "", user_prompt: "", raw_output: "", verdict: { parsed: true, tool_match: true, args_match: true, abstain_correct: null } } } };
    get().ingestProgress(done);
    flushBatchBufferForTests();
    expect(get().outcomeByKey[cellKey("m1", "a1")]?.kind).toBe("single"); // tail still landed
  });
});
