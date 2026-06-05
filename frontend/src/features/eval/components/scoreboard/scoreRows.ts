import type { BatchReport, TopError } from "../../../../shared/ipc/eval/batch";
import type { InstalledModelInfo } from "../../../../shared/ipc/models/storage";
import { modelLabel } from "../../../../shared/models/modelLabel";

const TOP_ERROR_LABEL: Record<TopError, string> = {
  none: "None",
  infinite_loop: "Loop Cap",
  hallucinated: "Fake Done",
  malformed_json: "Malformed",
  malformed_schema: "Bad Schema",
};

/// One per-model row of the Matrix Scoreboard. Every metric is a display string;
/// null/inapplicable sources render "N/A" (agentic metrics on a column that had
/// none) or "—" (single-turn rows have no steps/effort) — never a fabricated 0.
export interface ScoreRow {
  model: string;
  label: string;
  quant: string;
  passK: string;
  /// Phase 7.2 native function-calling Pass^k (Ollama `/api/chat` tool_calls),
  /// "N/A" when native wasn't measured for this model. Shown behind a toggle.
  passKNative: string;
  avgSteps: string;
  effort: string;
  schemaResil: string;
  topError: string;
  composite: string;
}

const fmtNum = (n: number | null) => (n == null ? "N/A" : (Math.round(n * 10) / 10).toString());
const fmtTokens = (n: number | null) => (n == null ? "N/A" : `${Math.round(n)} tok`);
const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function toScoreRows(report: BatchReport | null, models: InstalledModelInfo[]): ScoreRow[] {
  if (!report) return [];
  return report.columns.map((c) => {
    const info = models.find((m) => m.name === c.model);
    const ag = c.agentic;
    // The Pass column is unified: agentic → Pass^k (passes/total); single-turn →
    // the composite score as a percent; an errored column → "Error". So the matrix
    // is meaningful for any collection, not just agentic ones.
    const pass = c.error
      ? "Error"
      : ag
        ? `${ag.passes}/${ag.total_runs}`
        : fmtPct(c.toolcall?.composite);
    // Native FC pass^k is the parallel measurement; "N/A" when not run for this
    // model (unsupported backend / no `tools` capability) — never a fabricated 0.
    const nat = c.agentic_native_fc;
    const passKNative = c.error ? "Error" : nat ? `${nat.passes}/${nat.total_runs}` : "N/A";
    return {
      model: c.model,
      label: modelLabel(info ?? { name: c.model }),
      quant: info?.quantization || "—",
      passK: pass,
      passKNative,
      avgSteps: ag ? fmtNum(ag.avg_steps) : "—",
      effort: ag ? fmtTokens(ag.avg_output_tokens_success) : "—",
      // Schema resilience is agentic-only; null (no run hit a schema error) → "—".
      schemaResil: ag ? fmtPct(ag.schema_resilience) : "—",
      topError: c.error ? "Error" : ag ? TOP_ERROR_LABEL[ag.top_error] : "—",
      composite: fmtPct(c.toolcall?.composite),
    };
  });
}
