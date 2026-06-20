import { useState } from "react";
import { useEvalRegistryStore } from "../../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useBatchStore, cellKey } from "../../state/batchStore";
import { modelLabel } from "../../../../shared/models/modelLabel";
import { InfoButton } from "../../../../shared/ui/InfoButton";
import { Spinner } from "../../../../shared/ui/Spinner";
import { RunProgress } from "./RunProgress";
import { TOOL_HELP, metricTitle } from "../../help";

interface MatrixScoreboardProps {
  model: string;
  k: number;
  maxSteps: number;
  /// Phase 9 run shape, echoed as header chips: the difficulty tier label and the
  /// decoy-tool budget (`undefined` → "off"). They describe the LAST/active run's
  /// levers alongside the target model.
  tierLabel?: string;
  decoys?: number;
  focusedTaskId: string | null;
  setFocusedTaskId: (taskId: string | null) => void;
}

export function MatrixScoreboard({
  model,
  k,
  maxSteps,
  tierLabel,
  decoys,
  focusedTaskId,
  setFocusedTaskId,
}: MatrixScoreboardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { tasks } = useEvalRegistryStore();
  const list = useInstalledModelsStore((s) => s.list);
  const running = useBatchStore((s) => s.running);
  const progress = useBatchStore((s) => s.progress);
  const live = useBatchStore((s) => s.live);
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

  return (
    <div
      className="rounded-xl overflow-hidden border border-slate-200 shadow-sm"
      style={panelStyle}
      data-testid="matrix-scoreboard"
    >
      {/* Header — the chevron + title is one big toggle button (clear hit target). */}
      <div style={headerStyle}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          data-testid="simulator-collapse"
          title={collapsed ? "Expand the Simulator" : "Collapse"}
          style={collapseToggleStyle}
        >
          <span style={chevronStyle} aria-hidden>{collapsed ? "▸" : "▾"}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", fontFamily: "Inter, sans-serif" }}>
            2. THE SIMULATOR (Batch Scoreboard)
          </span>
        </button>
        <span
          style={{ fontSize: 13, color: "#2563eb", fontFamily: "'JetBrains Mono', monospace", fontWeight: 650 }}
          data-testid="scoreboard-run-chips"
        >
          &nbsp;- [ Target: {modelTargetLabel}
          {tierLabel ? ` · Tier: ${tierLabel}` : ""} · K: {k} · Decoys: {decoys ?? "off"} ]
        </span>
        {collapsed && (
          <span data-testid="simulator-collapsed-summary" style={{ marginLeft: 10, fontSize: 12, color: "#64748b", fontFamily: "Inter, sans-serif" }}>
            · {totalRuns > 0 ? `${passRate}% pass` : "no run yet"} · click to expand
          </span>
        )}
        {running && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 10, fontSize: 12, color: "#2563eb", fontFamily: "Inter, sans-serif", fontWeight: 600 }} data-testid="simulator-running">
            <Spinner /> Running…
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          <InfoButton {...TOOL_HELP.simulator} testId="simulator" />
        </span>
      </div>

      {collapsed ? null : (
      <>
      {error && (
        <div style={{ padding: "10px 16px", color: "#dc2626", fontSize: 12, fontFamily: "Inter, sans-serif" }} data-testid="scoreboard-error">
          {error}
        </div>
      )}

      {/* Live progress (visible during a run): task position, current Pass^k run +
          turn, the model's last action, and an elapsed clock — so even a stalled
          looping run visibly advances instead of looking hung. */}
      {running && <RunProgress done={progress.done} total={progress.total} live={live} k={k} maxSteps={maxSteps} />}

      {/* Inner Box Content */}
      <div style={{ padding: 16 }}>
        {/* Aggregate Stats */}
        <div style={aggregateBoxStyle}>
          {totalRuns > 0 ? (
            <span>
              AGGREGATE: <strong style={{ color: "#166534" }} title={metricTitle("passRate")}>{passRate}% Pass Rate</strong> ({totalPasses}/{totalRuns}) | <span title={metricTitle("avgSteps")}>Avg Steps:</span> <strong>{avgStepsVal}</strong> | <span title={metricTitle("effort")}>Effort:</span> <strong>{effortVal}</strong> tokens
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
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
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
                        <span style={passBadgeStyle}>Pass</span>
                      ) : (
                        <span style={failBadgeStyle}>Fail</span>
                      );
                    } else if (outcome.kind === "agentic") {
                      // Pass^k over k runs: all-pass = Pass, none = Fail, but a
                      // PARTIAL pass (e.g. 3/5) is "Unreliable", not a flat Fail —
                      // shown as an amber badge that matches the Matrix fraction.
                      const { passes, total_runs } = outcome.report;
                      resultEl =
                        passes === total_runs ? (
                          <span style={passBadgeStyle} data-testid={`result-${t.id}`}>Pass</span>
                        ) : passes === 0 ? (
                          <span style={failBadgeStyle} data-testid={`result-${t.id}`}>Fail</span>
                        ) : (
                          <span style={partialBadgeStyle} data-testid={`result-${t.id}`} title={`${passes}/${total_runs} runs passed — unreliable, not a clean pass`}>
                            Partial {passes}/{total_runs}
                          </span>
                        );
                    } else if (outcome.kind === "error") {
                      resultEl = <span style={failBadgeStyle}>Error</span>;
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
                        background: isActive ? "#eff6ff" : "transparent",
                      }}
                      data-testid={`scoreboard-row-${t.id}`}
                      title="Click to inspect this task in the Evaluator below"
                    >
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: isActive ? "#2563eb" : "#0f172a" }}>
                        {t.id}
                      </td>
                      <td style={tdStyle}>{categoryLabel}</td>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: "#64748b", fontSize: 12 }}>
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
                              color: "#2563eb",
                              fontWeight: isActive ? 600 : 400,
                            }}
                          >
                            [ View Trace ]
                          </button>
                          {isActive && <span style={{ color: "#2563eb", fontSize: 14 }}>◄</span>}
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
      </>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
};

const headerStyle: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid #e2e8f0",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  background: "#fafafa",
};

const collapseToggleStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 0,
  textAlign: "left",
};

/// The visible disclosure chevron — a 22px rounded chip so it reads as a control,
/// not a stray glyph. Shared shape across the Simulator/Evaluator headers.
const chevronStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: 6,
  background: "#e2e8f0",
  color: "#334155",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  flexShrink: 0,
};

const aggregateBoxStyle: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "10px 16px",
  fontSize: 13,
  color: "#334155",
  fontFamily: "Inter, sans-serif",
  marginBottom: 16,
  letterSpacing: "-0.01em",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 10,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "10px 12px",
  fontFamily: "Inter, sans-serif",
};

const tdStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#334155",
  padding: "10px 12px",
  fontFamily: "Inter, sans-serif",
};

const trStyle: React.CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  transition: "background 0.15s ease",
};

const passBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#dcfce7",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "Inter, sans-serif",
};

const partialBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#fef3c7",
  border: "1px solid #fcd34d",
  color: "#92400e",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "Inter, sans-serif",
};

const failBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "#fee2e2",
  border: "1px solid #fca5a5",
  color: "#991b1b",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 600,
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
