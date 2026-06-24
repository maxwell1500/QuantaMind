import type { BatchReport } from "../../shared/ipc/eval/batch";
import type { InstalledModelInfo } from "../../shared/ipc/models/storage";
import { toScoreRows } from "./components/scoreboard/scoreRows";

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/// The compliance artifact: one CSV row per model with the Pass^k / Effort /
/// Top-Error metrics a reviewer reads. Values come straight from the report
/// (N/A preserved), never synthesized.
export function batchToCsv(report: BatchReport, models: InstalledModelInfo[]): string {
  const header = ["Model", "Quant", "Pass^k", "Avg Steps", "Effort", "Top Error", "Composite"];
  const lines = [header.join(",")];
  for (const r of toScoreRows(report, models)) {
    lines.push([r.label, r.quant, r.passK, r.avgSteps, r.effort, r.topError, r.composite].map(csvCell).join(","));
  }
  return lines.join("\n");
}

/// Trigger a client-side file download from in-memory content (webview Blob).
export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
