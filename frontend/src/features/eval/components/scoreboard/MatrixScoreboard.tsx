import { useEvalRegistryStore } from "../../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useBatchStore, cellKey } from "../../state/batchStore";
import { modelLabel } from "../../../../shared/models/modelLabel";

interface MatrixScoreboardProps {
  model: string;
  k: number;
  maxSteps: number;
  focusedTaskId: string | null;
  setFocusedTaskId: (taskId: string | null) => void;
}

export function MatrixScoreboard({
  model,
  focusedTaskId,
  setFocusedTaskId,
}: MatrixScoreboardProps) {
  const { tasks } = useEvalRegistryStore();
  const list = useInstalledModelsStore((s) => s.list);
  const running = useBatchStore((s) => s.running);
  const progress = useBatchStore((s) => s.progress);
  const outcomeByKey = useBatchStore((s) => s.outcomeByKey);
  const error = useBatchStore((s) => s.error);

  const mInfo = list.find((x) => x.name === model);
  const modelTargetLabel = mInfo
    ? `${modelLabel(mInfo)}${mInfo.quantization ? ` (${mInfo.quantization})` : ""}`
    : model || "None";

  // Calculate dynamic aggregate statistics across tasks for the selected model
  let totalPasses = 0;
  let totalRuns = 0;
  let totalSteps = 0;
  let stepsCount = 0;
  let totalTokens = 0;
  let tokensCount = 0;

  for (const t of tasks) {
    const key = cellKey(model, t.id);
    const outcome = outcomeByKey[key];
    if (!outcome) continue;
    if (outcome.kind === "single") {
      totalPasses += outcome.passed ? 1 : 0;
      totalRuns += 1;
      totalSteps += 1;
      stepsCount += 1;
      if (outcome.trace.prompt_tokens != null) {
        totalTokens += outcome.trace.prompt_tokens;
        tokensCount += 1;
      }
    } else if (outcome.kind === "agentic") {
      totalPasses += outcome.report.passes;
      totalRuns += outcome.report.total_runs;
      if (outcome.report.avg_steps != null) {
        totalSteps += outcome.report.avg_steps * outcome.report.total_runs;
        stepsCount += outcome.report.total_runs;
      }
      if (outcome.report.avg_output_tokens_success != null) {
        totalTokens += outcome.report.avg_output_tokens_success * outcome.report.passes;
        tokensCount += outcome.report.passes;
      }
    }
  }

  const passRate = totalRuns > 0 ? Math.round((totalPasses / totalRuns) * 100) : 0;
  const avgStepsVal = stepsCount > 0 ? (totalSteps / stepsCount).toFixed(1) : "—";
  const effortVal = tokensCount > 0 ? Math.round(totalTokens / tokensCount).toLocaleString() : "—";

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10"
      style={panelStyle}
      data-testid="matrix-scoreboard"
    >
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
          2. THE SIMULATOR (Batch Scoreboard)
        </span>
        <span style={{ fontSize: 13, color: "#93c5fd", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
          &nbsp;- [ Target: {modelTargetLabel} ]
        </span>
      </div>

      {error && (
        <div style={{ padding: "10px 16px", color: "#fca5a5", fontSize: 12, fontFamily: "Inter, sans-serif" }} data-testid="scoreboard-error">
          {error}
        </div>
      )}

      {/* Progress Bar (Visible during batch evaluation) */}
      {running && (
        <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }} data-testid="scoreboard-progress">
          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "Inter,sans-serif", marginBottom: 6 }}>
            Running batch evaluation… {progress.done}/{progress.total || "?"}
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
            <div style={{ height: 4, width: `${pct}%`, background: "#3b82f6", borderRadius: 2, transition: "width 120ms" }} />
          </div>
        </div>
      )}

      {/* Inner Box Content */}
      <div style={{ padding: 16 }}>
        {/* Aggregate Stats */}
        <div style={aggregateBoxStyle}>
          {totalRuns > 0 ? (
            <span>
              AGGREGATE: <strong style={{ color: "#4ade80" }}>{passRate}% Pass Rate</strong> ({totalPasses}/{totalRuns}) | Avg Steps: <strong>{avgStepsVal}</strong> | Effort: <strong>{effortVal}</strong> tokens
            </span>
          ) : (
            <span style={{ color: "#64748b" }}>
              AGGREGATE: — Pass Rate | Avg Steps: — | Effort: —
            </span>
          )}
        </div>

        {/* Tasks Table */}
        {tasks.length === 0 ? (
          <div style={{ padding: "20px 0", color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif", textAlign: "center" }}>
            No tasks in this collection.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }} data-testid="scoreboard-table">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <th style={thStyle}>Task ID</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Target Tool</th>
                  <th style={thStyle}>Steps</th>
                  <th style={thStyle}>Result</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const key = cellKey(model, t.id);
                  const outcome = outcomeByKey[key];
                  
                  // Map category to display text
                  let categoryLabel: string = t.category;
                  if (t.category === "single") categoryLabel = "Single-Turn";
                  else if (t.category === "agentic") categoryLabel = "Multi-Step";
                  else if (t.category === "parallel") categoryLabel = "Parallel";
                  else if (t.category === "select") categoryLabel = "Select";
                  else if (t.category === "abstain") categoryLabel = "Abstain";

                  // Extract expected target tool(s)
                  let targetTool = "—";
                  if (t.expected.type === "call") {
                    targetTool = t.expected.name;
                  } else if (t.expected.type === "parallel") {
                    targetTool = t.expected.calls.map((c) => c.name).join(", ");
                  }

                  // Determine steps taken
                  let stepsStr = "—";
                  if (outcome) {
                    if (outcome.kind === "single") {
                      stepsStr = "1";
                    } else if (outcome.kind === "agentic") {
                      stepsStr = outcome.report.avg_steps != null ? (Math.round(outcome.report.avg_steps * 10) / 10).toString() : "—";
                    }
                  }

                  // Determine result badge/styling
                  let resultEl = <span style={{ color: "#64748b" }}>—</span>;
                  if (outcome) {
                    if (outcome.kind === "single") {
                      resultEl = outcome.passed ? (
                        <span style={passBadgeStyle}>🟢 PASS</span>
                      ) : (
                        <span style={failBadgeStyle}>🔴 FAIL</span>
                      );
                    } else if (outcome.kind === "agentic") {
                      const allPassed = outcome.report.passes === outcome.report.total_runs;
                      resultEl = allPassed ? (
                        <span style={passBadgeStyle}>🟢 PASS</span>
                      ) : (
                        <span style={failBadgeStyle}>🔴 FAIL</span>
                      );
                    } else if (outcome.kind === "error") {
                      resultEl = <span style={failBadgeStyle}>🔴 ERROR</span>;
                    }
                  }

                  const isActive = focusedTaskId === t.id;

                  return (
                    <tr
                      key={t.id}
                      onClick={() => setFocusedTaskId(t.id)}
                      style={{
                        ...trStyle,
                        cursor: "pointer",
                        background: isActive ? "rgba(59, 130, 246, 0.04)" : "transparent",
                      }}
                      data-testid={`scoreboard-row-${t.id}`}
                      title="Click to inspect this task in the Evaluator below"
                    >
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: isActive ? "#93c5fd" : "#cbd5e1" }}>
                        {t.id}
                      </td>
                      <td style={tdStyle}>{categoryLabel}</td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: "#94a3b8", fontSize: 12 }}>
                        {targetTool}
                      </td>
                      <td style={tdStyle}>{stepsStr}</td>
                      <td style={tdStyle}>{resultEl}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setFocusedTaskId(t.id)}
                            style={{
                              ...actionBtnStyle,
                              color: isActive ? "#93c5fd" : "#3b82f6",
                              fontWeight: isActive ? 600 : 400,
                            }}
                          >
                            [ View Trace ]
                          </button>
                          {isActive && <span style={{ color: "#3b82f6", fontSize: 14 }}>◄</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 11, color: "#475569", fontFamily: "Inter, sans-serif", marginTop: 10 }}>
          Steps: single-turn tasks are 1 turn; Multi-Step (agentic) tasks show avg steps across the
          K runs. Set the Task Type to “Multi-Step Agent” in the configurator to test a sandbox loop.
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, #121620 0%, #0d0f15 100%)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
};

const headerStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
};

const aggregateBoxStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 13,
  color: "#cbd5e1",
  fontFamily: "Inter, sans-serif",
  marginBottom: 16,
  letterSpacing: "-0.01em",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "8px 12px",
  fontFamily: "Inter, sans-serif",
};

const tdStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#e2e8f0",
  padding: "10px 12px",
  fontFamily: "Inter, sans-serif",
};

const trStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  transition: "background 0.15s ease",
};

const passBadgeStyle: React.CSSProperties = {
  color: "#4ade80",
  fontWeight: 600,
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
};

const failBadgeStyle: React.CSSProperties = {
  color: "#f87171",
  fontWeight: 600,
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
};

const actionBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: 4,
  transition: "all 0.15s ease",
};
