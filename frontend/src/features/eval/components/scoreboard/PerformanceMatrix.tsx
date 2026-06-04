import { useBatchStore } from "../../state/batchStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { toScoreRows } from "./scoreRows";
import { InfoButton } from "../../../../shared/ui/InfoButton";
import { TOOL_HELP, metricTitle } from "../../help";

/// Native title= tooltip for each metric column header (Model/Quant get none).
const COLUMN_HELP: Record<string, string | undefined> = {
  "Pass^k": metricTitle("passK"),
  "Avg Steps": metricTitle("avgSteps"),
  Effort: metricTitle("effort"),
  "Top Error": metricTitle("topError"),
};

/// The bottom-drawer LLM Performance Matrix: one row per targeted model
/// (Pass^k · Avg Steps · Effort · Top Error) from the completed batch. Clicking a
/// model row focuses it — the Simulator + Evaluator above switch to that model.
export function PerformanceMatrix({
  focusedModel,
  onFocusModel,
}: {
  focusedModel: string;
  onFocusModel: (m: string) => void;
}) {
  const report = useBatchStore((s) => s.report);
  const models = useInstalledModelsStore((s) => s.list);
  const rows = toScoreRows(report, models);

  return (
    <div className="rounded-xl overflow-hidden border border-white/10" style={panel} data-testid="performance-matrix">
      <div style={header}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
          4. LLM PERFORMANCE MATRIX
        </span>
        <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Inter, sans-serif" }}>
          &nbsp;(per-model summary — click a row to inspect that model)
        </span>
        <span style={{ marginLeft: "auto" }}>
          <InfoButton {...TOOL_HELP.performanceMatrix} testId="performance-matrix" />
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "18px 16px", color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
          Pick one or more target models and Run Batch to compare them here.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="performance-matrix-table">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["Model", "Quant", "Pass^k", "Avg Steps", "Effort", "Top Error"].map((h) => {
                const tip = COLUMN_HELP[h];
                return (
                  <th key={h} style={th} title={tip}>{h}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = r.model === focusedModel;
              return (
                <tr
                  key={r.model}
                  onClick={() => onFocusModel(r.model)}
                  data-testid={`matrix-model-row-${r.model}`}
                  style={{ cursor: "pointer", background: active ? "rgba(59,130,246,0.08)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  title="Click to inspect this model above"
                >
                  <td style={{ ...td, color: active ? "#93c5fd" : "#e2e8f0", fontWeight: active ? 600 : 400 }}>{r.label}</td>
                  <td style={td}>{r.quant}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{r.passK}</td>
                  <td style={td}>{r.avgSteps}</td>
                  <td style={td}>{r.effort}</td>
                  <td style={{ ...td, color: r.topError === "None" ? "#4ade80" : r.topError === "—" ? "#64748b" : "#fca5a5" }}>{r.topError}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "linear-gradient(145deg, #121620 0%, #0d0f15 100%)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
};
const header: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "8px 14px",
  fontFamily: "Inter, sans-serif",
};
const td: React.CSSProperties = { fontSize: 13, color: "#e2e8f0", padding: "9px 14px", fontFamily: "Inter, sans-serif" };
