import { useVisionStore } from "../../state/visionStore";
import { DiffView } from "../../../compare/components/DiffView";
import type { VisionReportRow } from "../../../../shared/ipc/eval/vision";

/// The MVP bundled OCR collection.
const COLLECTION = "easy-ocr";

/// Vision OCR results — a SEPARATE section, never mixed with the tool-calling tiers. Per task: the
/// bundled image beside the extracted-text↔ground-truth diff + CER/WER. A text-only (gated) model
/// shows "Cannot process", never a 0. Confabulation is flagged distinctly from inaccuracy.
export function VisionOCRPanel({ model }: { model: string }) {
  const { report, running, error, run } = useVisionStore();
  const scored = report?.rows.filter((r) => r.metrics != null) ?? [];
  const avg = (sel: (m: NonNullable<VisionReportRow["metrics"]>) => number) =>
    scored.length ? scored.reduce((s, r) => s + sel(r.metrics!), 0) / scored.length : null;
  const gated = report?.rows.filter((r) => r.status === "cannot_process").length ?? 0;

  return (
    <div style={panel} data-testid="vision-panel">
      <div style={headerRow}>
        <span style={title}>
          5. VISION OCR <span style={offBadge}>off-leaderboard</span>
        </span>
        <button type="button" data-testid="vision-run" disabled={!model || running} onClick={() => run(COLLECTION, model)} style={{ ...runBtn, ...((!model || running) ? runBtnDisabled : null) }}>
          {running ? "Running…" : `Run OCR${model ? ` · ${model}` : ""}`}
        </button>
      </div>
      {!model && <div style={hint}>Select a model to run the OCR eval.</div>}
      {error && <div style={errStyle} data-testid="vision-error">{error}</div>}
      {report && (
        <>
          <div style={summary} data-testid="vision-summary">
            avg CER {fmtPct(avg((m) => m.cer))} · avg WER {fmtPct(avg((m) => m.wer))}
            {gated ? ` · ${gated} cannot process` : ""}
          </div>
          {report.rows.map((r) => (
            <Row key={r.task_id} row={r} />
          ))}
        </>
      )}
    </div>
  );
}

function Row({ row }: { row: VisionReportRow }) {
  return (
    <div style={rowStyle} data-testid={`vision-row-${row.task_id}`}>
      <img src={`data:image/png;base64,${row.image_b64}`} alt={row.task_id} style={imgStyle} data-testid={`vision-image-${row.task_id}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowHeader}>
          <span style={{ fontWeight: 700, fontSize: 12 }}>{row.task_id}</span>
          {row.status === "cannot_process" && (
            <span style={badgeGray} data-testid={`vision-cannot-${row.task_id}`}>Cannot process — text-only model</span>
          )}
          {row.status === "empty_output" && <span style={badgeGray} data-testid={`vision-empty-${row.task_id}`}>No output</span>}
          {row.status === "hallucinated" && (
            <span style={badgeRed} data-testid={`vision-hallucinated-${row.task_id}`}>⚠ Hallucinated content</span>
          )}
          {row.metrics && (
            <span style={metricsChip} data-testid={`vision-metrics-${row.task_id}`}>
              CER {fmtPct(row.metrics.cer)} · WER {fmtPct(row.metrics.wer)}
            </span>
          )}
        </div>
        {row.status !== "cannot_process" && <DiffView a={row.ground_truth} b={row.extracted} />}
      </div>
    </div>
  );
}

function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 1000) / 10}%`;
}

const panel: React.CSSProperties = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, fontFamily: "Inter, sans-serif" };
const headerRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 };
const title: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 };
const offBadge: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" };
const runBtn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 6, cursor: "pointer", background: "#0f172a", color: "#fff", border: "1px solid #0f172a" };
const runBtnDisabled: React.CSSProperties = { background: "#e2e8f0", color: "#94a3b8", cursor: "not-allowed", borderColor: "#e2e8f0" };
const hint: React.CSSProperties = { fontSize: 12, color: "#94a3b8" };
const errStyle: React.CSSProperties = { fontSize: 12, color: "#b91c1c" };
const summary: React.CSSProperties = { fontSize: 12, color: "#475569", margin: "4px 0 10px", fontWeight: 600 };
const rowStyle: React.CSSProperties = { display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid #f1f5f9" };
const imgStyle: React.CSSProperties = { maxWidth: 160, maxHeight: 120, border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff" };
const rowHeader: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" };
const metricsChip: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #dbeafe" };
const badgeGray: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" };
const badgeRed: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" };
