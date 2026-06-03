import type { BatchReport, TopError } from "../../../../shared/ipc/eval/batch";
import type { InstalledModelInfo } from "../../../../shared/ipc/models/storage";
import { modelLabel } from "../../../../shared/models/modelLabel";

const TOP_ERROR_LABEL: Record<TopError, string> = {
  none: "None",
  infinite_loop: "Loop Cap",
  hallucinated: "Fake Done",
  malformed_json: "Malformed",
};

/// One per-model row of the Matrix Scoreboard. Every metric is a display string;
/// null/inapplicable sources render "N/A" (agentic metrics on a column that had
/// none) or "—" (single-turn rows have no steps/effort) — never a fabricated 0.
export interface ScoreRow {
  model: string;
  label: string;
  quant: string;
  passK: string;
  avgSteps: string;
  effort: string;
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
    return {
      model: c.model,
      label: modelLabel(info ?? { name: c.model }),
      quant: info?.quantization || "—",
      passK: pass,
      avgSteps: ag ? fmtNum(ag.avg_steps) : "—",
      effort: ag ? fmtTokens(ag.avg_output_tokens_success) : "—",
      topError: c.error ? "Error" : ag ? TOP_ERROR_LABEL[ag.top_error] : "—",
      composite: fmtPct(c.toolcall?.composite),
    };
  });
}
