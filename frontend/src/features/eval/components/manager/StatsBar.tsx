/// The four tool-call sub-scores as a fixed bar. Fed either the aggregate
/// ToolCallReport (run-all) or a single task's derived scores (verdictToScores).
export interface Scores {
  parse_rate: number | null;
  tool_selection_acc: number | null;
  arg_acc: number | null;
  abstain_acc: number | null;
}

export function StatsBar({ scores }: { scores: Scores | null }) {
  const fmt = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  const cells = [
    { label: "Parse Rate", value: fmt(scores?.parse_rate) },
    { label: "Tool Acc.", value: fmt(scores?.tool_selection_acc) },
    { label: "Arg Acc.", value: fmt(scores?.arg_acc) },
    { label: "Abstain", value: fmt(scores?.abstain_acc) },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(0,0,0,0.15)",
      }}
      data-testid="eval-stats-bar"
    >
      {cells.map(({ label, value }, idx) => (
        <div
          key={label}
          style={{
            padding: "10px 0",
            textAlign: "center",
            borderRight: idx < 3 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}
        >
          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter,sans-serif", marginBottom: 2 }}>
            {label}
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: scores ? "#e2e8f0" : "#334155",
              fontFamily: "Inter,sans-serif",
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
