import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toScoreRows } from "../components/scoreboard/scoreRows";
import type { BatchReport } from "../../../shared/ipc/eval/batch";
import type { InstalledModelInfo } from "../../../shared/ipc/models/storage";

/// jsdom here doesn't expose localStorage; cliff depth reads from it, so back it
/// with a Map for the duration of these tests.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const model = (name: string, quantization: string): InstalledModelInfo =>
  ({ name, quantization, parameter_size: "7B", family: "x", size_bytes: 0, modified_at: "", backend: "ollama" }) as InstalledModelInfo;

describe("toScoreRows", () => {
  it("returns no rows without a report", () => {
    expect(toScoreRows(null, [])).toEqual([]);
  });

  it("formats agentic metrics and shows N/A for nulls, — for single-turn cells", () => {
    const report: BatchReport = {
      collection_id: "c",
      columns: [
        {
          model: "qwen",
          backend: "ollama",
          toolcall: null,
          agentic: { passes: 3, total_runs: 5, avg_steps: 2.44, avg_output_tokens_success: 119.6, schema_resilience: null, top_error: "hallucinated", failures: { infinite_loop_hits: 0, hallucinated_completions: 2, malformed_json_calls: 0, schema_unrecovered_calls: 0 } },
          error: null,
        },
        {
          model: "loopy",
          backend: "ollama",
          toolcall: null,
          agentic: { passes: 0, total_runs: 5, avg_steps: null, avg_output_tokens_success: null, schema_resilience: null, top_error: "infinite_loop", failures: { infinite_loop_hits: 5, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 0 } },
          error: null,
        },
      ],
    };
    const rows = toScoreRows(report, [model("qwen", "Q4_K_M")]);

    expect(rows[0]).toMatchObject({ label: "qwen", quant: "Q4_K_M", passK: "3/5", avgSteps: "2.4", effort: "120 tok", topError: "Fake Done" });
    // Unknown model → quant falls back to "—"; null agentic metrics → "N/A".
    expect(rows[1]).toMatchObject({ quant: "—", passK: "0/5", avgSteps: "N/A", effort: "N/A", topError: "Loop Cap" });
  });

  it("maps schema resilience as a percent (— when null) and reads cliff depth from the probe marker", () => {
    localStorage.setItem("quantamind-cliff-qwen", "8192");
    const report: BatchReport = {
      collection_id: "c",
      columns: [
        {
          model: "qwen", // has a cliff marker + a measured resilience
          backend: "ollama",
          toolcall: null,
          agentic: { passes: 4, total_runs: 5, avg_steps: 2, avg_output_tokens_success: 100, schema_resilience: 0.5, top_error: "malformed_schema", failures: { infinite_loop_hits: 0, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 1 } },
          error: null,
        },
        {
          model: "noprobe", // no cliff marker, no schema errors seen
          backend: "ollama",
          toolcall: null,
          agentic: { passes: 5, total_runs: 5, avg_steps: 1, avg_output_tokens_success: 80, schema_resilience: null, top_error: "none", failures: { infinite_loop_hits: 0, hallucinated_completions: 0, malformed_json_calls: 0, schema_unrecovered_calls: 0 } },
          error: null,
        },
      ],
    };
    const rows = toScoreRows(report, []);
    expect(rows[0]).toMatchObject({ schemaResil: "50%", cliffDepth: "8192 tok", topError: "Bad Schema" });
    expect(rows[1]).toMatchObject({ schemaResil: "—", cliffDepth: "—" });
    localStorage.removeItem("quantamind-cliff-qwen");
  });

  it("shows — for steps/effort when the column has no agentic tasks", () => {
    const report: BatchReport = {
      collection_id: "c",
      columns: [
        {
          model: "m",
          backend: "ollama",
          toolcall: { n: 3, parse_rate: 1, tool_selection_acc: 1, arg_acc: 1, abstain_acc: null, composite: 0.92, prompt_tokens: null, per_task: [] },
          agentic: null,
          error: null,
        },
      ],
    };
    const rows = toScoreRows(report, []);
    // Single-turn columns now surface the composite as the Pass cell (not "—"),
    // so the matrix is meaningful for non-agentic collections too.
    expect(rows[0]).toMatchObject({ passK: "92%", avgSteps: "—", effort: "—", topError: "—", composite: "92%" });
  });
});
