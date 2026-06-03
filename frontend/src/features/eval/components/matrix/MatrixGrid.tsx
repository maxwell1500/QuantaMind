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

function Letter({ on, title, children }: { on: boolean; title: string; children: string }) {
  return (
    <span title={`${title} — ${on ? "pass" : "fail"}`} style={{ color: on ? PASS : FAIL, fontWeight: 600, cursor: "help" }}>
      {children}
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
        style={{ color: ok ? PASS : FAIL, fontWeight: 600 }}
      >
        Abs {ok ? "✓" : "✗"}
      </span>
    );
  }
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3 }}>
      <Letter on={v.parsed} title="P: Parsed — output was valid JSON">P</Letter>{" "}
      <Letter on={v.tool_match} title="T: Tool — selected the expected tool">T</Letter>{" "}
      <Letter on={v.args_match} title="A: Args — arguments matched expected">A</Letter>
    </span>
  );
}

/// A scored cell is a button that opens the saved trace (no re-run); a not-run
/// cell ("—") is inert.
function Cell({ result, onView }: { result?: ToolTaskResult; onView?: () => void }) {
  if (!result) return <span style={{ color: NA }} title="Not run">—</span>;
  if (!onView) return <Badge result={result} />;
  return (
    <button
      type="button"
      onClick={onView}
      title="View this task's saved trace"
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      <Badge result={result} />
    </button>
  );
}

/// Key for the P/T/A/Abs badges so the abbreviations aren't a mystery.
function Legend() {
  const item = (letter: string, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <b style={{ color: "#cbd5e1", fontFamily: "'JetBrains Mono', monospace" }}>{letter}</b>
      <span style={{ color: "#94a3b8" }}>{label}</span>
    </span>
  );
  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "8px 20px 2px", fontSize: 11, fontFamily: "Inter,sans-serif" }}
      data-testid="eval-matrix-legend"
    >
      {item("P", "Parsed (valid JSON)")}
      {item("T", "Tool match (right tool)")}
      {item("A", "Args match (right arguments)")}
      {item("Abs", "Abstained (correctly no call)")}
      <span style={{ color: "#475569" }}>·</span>
      <span style={{ color: PASS }}>green = pass</span>
      <span style={{ color: FAIL }}>red = fail</span>
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
        <div style={{ padding: 24, textAlign: "center", color: "#475569", fontSize: 13, fontFamily: "Inter,sans-serif" }} data-testid="eval-matrix-empty">
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
    <div style={{ overflow: "auto", padding: "4px 20px 8px" }} data-testid="eval-matrix-grid">
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Inter,sans-serif" }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: "left" }}>Task Name</th>
            {report.columns.map((c) => (
              <th key={c.model} style={thStyle}>
                <div style={{ color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{c.model}</div>
                {c.error && <div style={{ color: FAIL, fontSize: 10, fontWeight: 400 }} title={c.error}>error</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ ...tdStyle, textAlign: "left", color: "#94a3b8" }}>{t.id}</td>
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
  fontWeight: 600,
  color: "#64748b",
  padding: "6px 10px",
};

const tdStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 12,
  padding: "8px 10px",
};
