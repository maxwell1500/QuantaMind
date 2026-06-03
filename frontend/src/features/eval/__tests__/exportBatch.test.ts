import { describe, expect, it } from "vitest";
import { batchToCsv } from "../exportBatch";
import type { BatchReport } from "../../../shared/ipc/eval/batch";

describe("batchToCsv", () => {
  it("emits a header + one row per model, preserving N/A", () => {
    const report: BatchReport = {
      collection_id: "c",
      columns: [
        {
          model: "qwen",
          backend: "ollama",
          toolcall: null,
          agentic: { passes: 3, total_runs: 5, avg_steps: 2.4, avg_output_tokens_success: 120, top_error: "hallucinated" },
          error: null,
        },
        {
          model: "loopy",
          backend: "ollama",
          toolcall: null,
          agentic: { passes: 0, total_runs: 5, avg_steps: null, avg_output_tokens_success: null, top_error: "infinite_loop" },
          error: null,
        },
      ],
    };
    const csv = batchToCsv(report, []);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Model,Quant,Pass^k,Avg Steps,Effort,Top Error,Composite");
    expect(lines[1]).toBe("qwen,—,3/5,2.4,120 tok,Fake Done,—");
    expect(lines[2]).toContain("N/A"); // the loopy row keeps N/A, never a fake 0
  });
});
