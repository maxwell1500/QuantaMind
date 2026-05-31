import type { CompareRow } from "../../compare/state/compareRow";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import type { LoadedModel } from "../../../shared/ipc/system/vram";
import type { HistoryEntry } from "../../../shared/ipc/workspace/history";
import { pickLoaded } from "../format/vram";
import { esc, hardwareHtml, modelSectionHtml } from "./sections";

export interface ReportInput {
  rows: CompareRow[];
  hardware: HardwareSnapshot | null;
  vramByName: Map<string, LoadedModel>;
  history: HistoryEntry[];
  generatedAtIso: string;
}

const STYLE = `body{font:13px -apple-system,system-ui,sans-serif;color:#111827;max-width:720px;margin:24px auto;padding:0 16px}
h1{font-size:18px}h2{font-size:14px;margin:18px 0 6px}section{border-top:1px solid #e5e7eb;padding-top:8px}
.row{display:flex;justify-content:space-between;padding:2px 0}.k{color:#6b7280}.label{color:#9ca3af;font-size:11px;margin:8px 0 2px}
.muted{color:#9ca3af;font-size:12px}svg{display:block}`;

/// Build a single self-contained HTML performance report (inline CSS + inline
/// SVG, no external assets). Pure string builder.
export function buildInspectorHtml(input: ReportInput): string {
  const nowMs = Date.parse(input.generatedAtIso) || 0;
  const g = input.hardware?.gpu;
  const unified = !!g?.unified;
  const deviceTotal = unified ? input.hardware?.total_memory_bytes ?? null : g?.vram_total_bytes ?? null;
  const charted = input.rows.filter((r) => (r.metrics?.timeline?.length ?? 0) > 0);
  const models = charted
    .map((r) => modelSectionHtml(r, pickLoaded(input.vramByName, r.model), input.history, nowMs, deviceTotal, unified))
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>QuantaMind Performance Report</title><style>${STYLE}</style></head><body>` +
    `<h1>QuantaMind Performance Report</h1>` +
    `<p class=muted>Generated ${esc(input.generatedAtIso)}</p>` +
    hardwareHtml(input.hardware) +
    (models || "<p class=muted>No runs to report.</p>") +
    `</body></html>`;
}
