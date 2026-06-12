import type { ToolTask } from "../../../../shared/ipc/eval/registry";
import type { MatrixReport, MatrixColumn } from "../../../../shared/ipc/eval/matrix";
import type { ToolTaskResult } from "../../../../shared/ipc/eval/toolcall";

const PASS = "#4ade80";
const FAIL = "#f87171";
const NA = "#475569";

function verdictMap(col: MatrixColumn): Record<string, ToolTaskResult> {
  const map: Record<string, ToolTaskResult> = {};
  col.report?.per_task.forEach((pt) => { map[pt.id] = pt; });
  return map;
}

function Pill({ letter, on, title }: { letter: string; on: boolean; title: string }) {
  return (
    <span
      title={`${title} — ${on ? "pass" : "fail"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: "50%",
        fontSize: 10,
        fontWeight: 800,
        fontFamily: "'JetBrains Mono', monospace",
        background: on ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
        border: on ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(248,113,113,0.3)",
        color: on ? PASS : FAIL,
        boxShadow: on ? "0 0 6px rgba(74,222,128,0.1)" : "none",
        cursor: "help",
        transition: "all 0.15s",
      }}
    >
      {letter}
    </span>
  );
}

function Badge({ result }: { result: ToolTaskResult }) {
  const v = result.verdict;
  if (result.category === "abstain") {
    const ok = v.abstain_correct === true;
    return (
      <span
        title={`Abstain — ${ok ? "correctly made no tool call" : "called a tool when none was expected"}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 11,
          fontWeight: 700,
          background: ok ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
          border: ok ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(248,113,113,0.3)",
          color: ok ? PASS : FAIL,
          boxShadow: ok ? "0 0 8px rgba(74,222,128,0.1)" : "none",
        }}
      >
        Abs {ok ? "✓" : "✗"}
      </span>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 5 }}>
      <Pill letter="P" on={v.parsed} title="P: Parsed — output was valid JSON" />
      <Pill letter="T" on={v.tool_match} title="T: Tool — selected the expected tool" />
      <Pill letter="A" on={v.args_match} title="A: Args — arguments matched expected" />
    </span>
  );
}

/// A scored cell is a button that opens the saved trace (no re-run); a not-run
/// cell ("—") is inert.
function Cell({ result, onView }: { result?: ToolTaskResult; onView?: () => void }) {
  if (!result) return <span style={{ color: NA, fontWeight: 500 }} title="Not run">—</span>;
  if (!onView) return <Badge result={result} />;
  return (
    <button
      type="button"
      onClick={onView}
      title="View this task's saved trace"
      className="hover:scale-105 active:scale-95 transition-all duration-150"
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}
    >
      <Badge result={result} />
    </button>
  );
}

/// Key for the P/T/A/Abs badges so the abbreviations aren't a mystery.
function Legend() {
  const item = (letter: string, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        fontSize: 9,
        fontWeight: 800,
        fontFamily: "'JetBrains Mono', monospace",
        background: "rgba(255, 255, 255, 0.04)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        color: "#cbd5e1",
      }}>
        {letter}
      </span>
      <span style={{ color: "#94a3b8" }}>{label}</span>
    </span>
  );
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 16,
        padding: "10px 20px 10px",
        fontSize: 11,
        fontFamily: "Inter,sans-serif",
        background: "rgba(0,0,0,0.12)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
      data-testid="eval-matrix-legend"
    >
      {item("P", "Parsed (valid JSON)")}
      {item("T", "Tool match (right tool)")}
      {item("A", "Args match (right arguments)")}
      {item("Abs", "Abstained (correctly no call)")}
      <span style={{ color: "#334155" }}>|</span>
      <span style={{ color: PASS, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: PASS }} /> green = pass
      </span>
      <span style={{ color: FAIL, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: FAIL }} /> red = fail
      </span>
    </div>
  );
}

/// Tasks (rows) × models (columns) grid of P/T/A pass badges. A failed model
/// shows its error under the column header and "—" cells. Clicking a scored cell
/// hands (collection, task, model) to the trace debugger via `onViewTrace`.
export function MatrixGrid({
  tasks,
  report,
  onViewTrace,
}: {
  tasks: ToolTask[];
  report: MatrixReport | null;
  onViewTrace?: (f: { collection: string; taskId: string; model: string }) => void;
}) {
  return (
    <div>
      <Legend />
      {!report ? (
        <div style={{ padding: 32, textAlign: "center", color: "#475569", fontSize: 13, fontFamily: "Inter,sans-serif" }} data-testid="eval-matrix-empty">
          Choose models from the Models dropdown and press ▶ Run to fill the matrix.
        </div>
      ) : (
        <Grid tasks={tasks} report={report} onViewTrace={onViewTrace} />
      )}
    </div>
  );
}

function Grid({
  tasks,
  report,
  onViewTrace,
}: {
  tasks: ToolTask[];
  report: MatrixReport;
  onViewTrace?: (f: { collection: string; taskId: string; model: string }) => void;
}) {
  const maps = report.columns.map(verdictMap);

  return (
    <div style={{ overflow: "auto", padding: "8px 20px 12px" }} data-testid="eval-matrix-grid">
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Inter,sans-serif" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: "left" }}>Task Name</th>
            {report.columns.map((c) => (
              <th key={c.model} style={thStyle}>
                <div style={{ color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160, fontWeight: 700 }}>{c.model}</div>
                {c.error && <div style={{ color: FAIL, fontSize: 10, fontWeight: 500, marginTop: 2 }} title={c.error}>error</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="hover:bg-white/[0.02] transition-colors duration-100" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ ...tdStyle, textAlign: "left", color: "#94a3b8", fontWeight: 500 }}>{t.id}</td>
              {report.columns.map((c, ci) => (
                <td key={c.model} style={tdStyle} data-testid={`eval-matrix-cell-${t.id}-${c.model}`}>
                  <Cell
                    result={maps[ci][t.id]}
                    onView={
                      onViewTrace && maps[ci][t.id]
                        ? () => onViewTrace({ collection: report.collection_id, taskId: t.id, model: c.model })
                        : undefined
                    }
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  padding: "8px 10px",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  padding: "10px 10px",
};
