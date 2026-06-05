import { useState } from "react";
import { useBatchStore } from "../../state/batchStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useNavStore } from "../../../../shared/state/navStore";
import { toScoreRows } from "./scoreRows";
import { InfoButton } from "../../../../shared/ui/InfoButton";
import { TOOL_HELP, metricTitle } from "../../help";

/// Native title= tooltip for each metric column header (Model/Quant get none).
const COLUMN_HELP: Record<string, string | undefined> = {
  "Pass^k": metricTitle("passK"),
  "Native FC": "Pass^k measured via the model's NATIVE tool_calls API (Ollama /api/chat), not the prompt-based proxy. N/A when not measured / unsupported.",
  "Avg Steps": metricTitle("avgSteps"),
  Effort: metricTitle("effort"),
  "Schema Resil.": metricTitle("schemaResil"),
  "Cliff Depth": metricTitle("cliffDepth"),
  "Top Error": metricTitle("topError"),
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  fontFamily: "Inter, sans-serif",
};

function getPassKBadge(val: string) {
  if (val === "Error") {
    return <span style={{ ...badgeStyle, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>Error</span>;
  }
  if (val === "—" || val === "N/A") {
    return <span style={{ color: "#475569" }}>—</span>;
  }
  
  const isPerfect = val.includes("/") 
    ? val.split("/")[0] === val.split("/")[1]
    : val === "100%";
    
  if (isPerfect) {
    return <span style={{ ...badgeStyle, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>{val}</span>;
  }
  
  return <span style={{ ...badgeStyle, background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.22)", color: "#facc15" }}>{val}</span>;
}

function getSchemaResilBadge(val: string) {
  if (val === "—") {
    return <span style={{ color: "#64748b", fontStyle: "italic" }}>—</span>;
  }
  if (val === "N/A") {
    return <span style={{ color: "#475569" }}>N/A</span>;
  }
  if (val === "100%") {
    return <span style={{ ...badgeStyle, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>{val}</span>;
  }
  if (val === "0%") {
    return <span style={{ ...badgeStyle, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>{val}</span>;
  }
  return <span style={{ ...badgeStyle, background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.22)", color: "#facc15" }}>{val}</span>;
}

function getTopErrorBadge(val: string) {
  if (val === "None") {
    return <span style={{ ...badgeStyle, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80" }}>None ✓</span>;
  }
  if (val === "Loop Cap") {
    return <span style={{ ...badgeStyle, background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.25)", color: "#fb923c" }}>Loop Cap ⚠️</span>;
  }
  if (val === "Fake Done") {
    return <span style={{ ...badgeStyle, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>Fake Done 🛑</span>;
  }
  if (val === "Bad Schema") {
    return <span style={{ ...badgeStyle, background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.35)", color: "#fca5a5" }}>Bad Schema ❌</span>;
  }
  if (val === "Error") {
    return <span style={{ ...badgeStyle, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>Error 🛑</span>;
  }
  if (val === "—" || val === "N/A") {
    return <span style={{ color: "#475569" }}>—</span>;
  }
  return <span style={{ ...badgeStyle, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8" }}>{val}</span>;
}

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
  const goAudit = useNavStore((s) => s.setTopView);
  const rows = toScoreRows(report, models);
  // The Native-FC column only appears when at least one model was measured
  // natively; a toggle keeps the prompt-based view the default.
  // Note: "N/A" contains "/", so check the column data, not the formatted string.
  const anyNative = (report?.columns ?? []).some((c) => c.agentic_native_fc != null);
  const [showNative, setShowNative] = useState(false);
  const columns = [
    "Model",
    "Quant",
    "Pass^k",
    ...(showNative ? ["Native FC"] : []),
    "Avg Steps",
    "Effort",
    "Schema Resil.",
    "Cliff Depth",
    "Top Error",
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/10 transition-all duration-300 shadow-2xl"
      style={panel}
      data-testid="performance-matrix"
    >
      <div style={header}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="flex h-2 w-2 rounded-full bg-blue-500" />
          <span style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", fontFamily: "Inter, sans-serif", letterSpacing: "0.03em" }}>
            4. LLM PERFORMANCE MATRIX
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter, sans-serif" }}>
          &nbsp;(per-model summary — click a row to inspect model details)
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10 }}>
          {anyNative && (
            <button
              type="button"
              data-testid="matrix-native-toggle"
              onClick={() => setShowNative((v) => !v)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid rgba(59,130,246,0.4)",
                background: showNative ? "rgba(59,130,246,0.2)" : "transparent",
                color: "#93c5fd",
                cursor: "pointer",
              }}
            >
              {showNative ? "Hide" : "Show"} Native-FC {showNative ? "🟢" : ""}
            </button>
          )}
          <InfoButton {...TOOL_HELP.performanceMatrix} testId="performance-matrix" />
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "24px 20px", color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif", textAlign: "center" }}>
          Pick one or more target models and Run Batch to compare them here.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="performance-matrix-table">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.12)" }}>
                {columns.map((h) => {
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
                    className="hover:bg-white/[0.03] transition-all duration-150 relative"
                    style={{
                      cursor: "pointer",
                      background: active ? "rgba(59,130,246,0.1)" : "transparent",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
                    }}
                    title="Click to inspect this model above"
                  >
                    <td style={{ ...td, color: active ? "#93c5fd" : "#f1f5f9", fontWeight: active ? 700 : 500 }}>{r.label}</td>
                    <td style={{ ...td, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.quant}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{getPassKBadge(r.passK)}</td>
                    {showNative && (
                      <td style={{ ...td, fontWeight: 700 }} data-testid={`matrix-native-${r.model}`}>
                        {getPassKBadge(r.passKNative)}
                      </td>
                    )}
                    <td style={{ ...td, color: r.avgSteps === "—" ? "#475569" : "#cbd5e1" }}>{r.avgSteps}</td>
                    <td style={{ ...td, color: r.effort === "—" ? "#475569" : "#cbd5e1", fontFamily: r.effort !== "—" ? "'JetBrains Mono', monospace" : "inherit", fontSize: 12 }}>{r.effort}</td>
                    <td style={td}>{getSchemaResilBadge(r.schemaResil)}</td>
                    <td style={td}>
                      {r.cliffDepth === "—" ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); goAudit("audit"); }}
                          title="Not measured yet — run the Context-Cliff probe in the Audit tab for this model"
                          style={cliffLink}
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-400 hover:text-blue-300 transition-all cursor-pointer inline-flex items-center gap-1"
                          data-testid={`cliff-run-${r.model}`}
                        >
                          Run probe ↗
                        </button>
                      ) : (
                        <span style={{ ...badgeStyle, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#cbd5e1", textTransform: "none" }}>{r.cliffDepth}</span>
                      )}
                    </td>
                    <td style={td}>{getTopErrorBadge(r.topError)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const panel: React.CSSProperties = {
  background: "linear-gradient(145deg, #10141f 0%, #0a0d14 100%)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
};
const header: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 10,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "10px 14px",
  fontFamily: "Inter, sans-serif",
};
const td: React.CSSProperties = {
  fontSize: 13,
  color: "#cbd5e1",
  padding: "10px 14px",
  fontFamily: "Inter, sans-serif",
};
const cliffLink: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 0,
};
