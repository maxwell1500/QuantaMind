import type { CSSProperties } from "react";
import type { AgentPath, MemoryProfile, ModelVerdict } from "../../../shared/ipc/eval/readiness";
import type { BackendKind } from "../../../shared/ipc/models/storage";
import { StatusBadge } from "./StatusBadge";

const PATH_LABEL: Record<AgentPath, string> = {
  prompt_based: "Prompt-Based",
  native_fc: "Native FC",
};

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);

/// The per-model memory footprint vs the cap, or an honest N/A for single-model
/// backends (where precise dims aren't available). Silent when fit simply wasn't
/// measured (no cap / Ollama unreachable) — never a guessed line.
function MemoryLine({ m, backend }: { m: MemoryProfile | null | undefined; backend: BackendKind }) {
  if (!m) {
    if (backend !== "ollama") {
      return <div style={{ color: "#64748b", marginBottom: 4 }}>VRAM fit: N/A (single-model backend)</div>;
    }
    return null;
  }
  const note = !m.fits ? "won't fit" : m.pressure ? "high VRAM pressure" : "fits";
  const color = !m.fits ? "#dc2626" : m.pressure ? "#b45309" : "#16a34a";
  return (
    <div style={{ color, marginBottom: 4 }}>
      VRAM: {gb(m.total_bytes)} GB ({gb(m.weights_bytes)} model + {gb(m.kv_cache_bytes)} cache){" "}
      {m.fits ? "<" : ">"} {gb(m.cap_bytes)} GB cap · {note}
    </div>
  );
}

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "8px 12px",
};
const tdStyle: CSSProperties = { fontSize: 13, color: "#1e293b", padding: "12px", verticalAlign: "top" };

/// One model's diagnostic reasons: blocking issues (✗, red) take priority, then
/// conditions (!, amber). A clean Ready row with neither says so explicitly —
/// the verdict is never a bare status with no "why".
function Reasons({ v }: { v: ModelVerdict["verdict"] }) {
  if (v.blocking.length === 0 && v.conditions.length === 0) {
    return <div style={{ color: "#16a34a" }}>✓ Meets all criteria for this profile</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {v.blocking.map((b, i) => (
        <div key={`b${i}`} style={{ color: "#dc2626" }}>✗ {b}</div>
      ))}
      {v.conditions.map((c, i) => (
        <div key={`c${i}`} style={{ color: "#b45309" }}>! {c}</div>
      ))}
    </div>
  );
}

/// The verdict scoreboard: one row per model with its status badge, the measured
/// path (prompt-based vs native), and the interpolated diagnostic reasons.
export function VerdictTable({ verdicts }: { verdicts: ModelVerdict[] }) {
  return (
    <table data-testid="readiness-verdict-table" style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
          <th style={thStyle}>Model</th>
          <th style={thStyle}>Backend</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Memory &amp; diagnostic reasons</th>
        </tr>
      </thead>
      <tbody>
        {verdicts.map((m) => (
          <tr key={`${m.model}-${m.backend}`} data-testid={`readiness-row-${m.model}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
            <td style={tdStyle}>
              <div style={{ fontWeight: 600 }}>{m.model}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>({PATH_LABEL[m.verdict.path]})</div>
            </td>
            <td style={{ ...tdStyle, color: "#475569" }}>{m.backend}</td>
            <td style={tdStyle}><StatusBadge status={m.verdict.status} /></td>
            <td style={tdStyle}>
              <MemoryLine m={m.memory} backend={m.backend} />
              <Reasons v={m.verdict} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
