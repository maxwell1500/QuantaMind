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
        { model: "m1", backend: "ollama", toolcall: null, agentic: { passes: 0, total_runs: 5, avg_steps: null, avg_output_tokens_success: null, schema_resilience: null, top_error: "infinite_loop" }, error: null },
      ],
    };
    get().complete(report);

    expect(get().running).toBe(false);
    expect(get().report?.columns[0].agentic?.avg_output_tokens_success).toBeNull();
    expect(get().report?.columns[0].agentic?.avg_steps).toBeNull();
  });
});
