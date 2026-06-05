import { useState, useEffect } from "react";
import { useBatchStore, cellKey } from "../state/batchStore";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { traceDiag } from "../verdict";
import { ConfigPhase } from "./pipeline/ConfigPhase";
import { SystemMessagePhase } from "./pipeline/SystemMessagePhase";
import { VerifyPhase } from "./pipeline/VerifyPhase";
import { InfoButton } from "../../../shared/ui/InfoButton";
import { TOOL_HELP } from "../help";

interface TraceDebuggerProps {
  model: string;
  taskId: string | null;
  setTaskId: (id: string | null) => void;
}

type TabType = "config" | "prompt" | "trace" | "matcher";

export function TraceDebugger({
  model,
  taskId,
  setTaskId,
}: TraceDebuggerProps) {
  const { tasks } = useEvalRegistryStore();
  const outcomeByKey = useBatchStore((s) => s.outcomeByKey);
  const stepsByKey = useBatchStore((s) => s.stepsByKey);

  const [activeTab, setActiveTab] = useState<TabType>("trace");

  // Find the selected task definition
  const task = tasks.find((t) => t.id === taskId) ?? null;

  // Auto-focus the first task if taskId is not set and tasks are available
  useEffect(() => {
    if (tasks.length > 0 && !taskId) {
      setTaskId(tasks[0].id);
    }
  }, [tasks, taskId, setTaskId]);

  if (!taskId || !task) {
    return (
      <div
        className="rounded-xl overflow-hidden border border-white/10"
        style={panelStyle}
        data-testid="trace-debugger"
      >
        <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif", padding: 20 }}>
          Select a task in the Simulator above to begin single-task pipeline debugging.
        </div>
      </div>
    );
  }

  const key = cellKey(model, taskId);
  const outcome = outcomeByKey[key];
  const steps = stepsByKey[key] || [];

  // Tab labels helper
  const renderTabHeader = (id: TabType, label: string) => {
    const isActive = activeTab === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setActiveTab(id)}
        style={{
          ...tabBtnStyle,
          background: isActive ? "rgba(59, 130, 246, 0.12)" : "rgba(255, 255, 255, 0.03)",
          color: isActive ? "#93c5fd" : "#94a3b8",
          borderColor: isActive ? "rgba(59, 130, 246, 0.3)" : "rgba(255, 255, 255, 0.08)",
          fontWeight: isActive ? 600 : 400,
        }}
        data-testid={`evaluator-tab-${id}`}
      >
        {isActive ? "◉ " : ""}
        {label}
      </button>
    );
  };

  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10"
      style={panelStyle}
      data-testid="trace-debugger"
    >
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
          3. THE EVALUATOR (Single-Task Pipeline Debugger)
        </span>
        <span style={{ fontSize: 13, color: "#3b82f6", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
          &nbsp;- [ Inspecting: {taskId} ]
        </span>
        <span style={{ marginLeft: "auto" }}>
          <InfoButton {...TOOL_HELP.evaluator} testId="evaluator" />
        </span>
      </div>

      {/* Tabs Menu */}
      <div style={tabsContainerStyle}>
        {renderTabHeader("config", "Task Config")}
        {renderTabHeader("prompt", "System Prompt Pkg")}
        {renderTabHeader("trace", "Live Trace / Stream")}
        {renderTabHeader("matcher", "AST Matcher")}
      </div>

      {/* Tab Contents */}
      <div style={{ padding: 20 }}>
        {activeTab === "config" && (
          <ConfigPhase task={task} />
        )}

        {activeTab === "prompt" && (
          <SystemMessagePhase
            systemMessage={
              outcome?.kind === "single"
                ? outcome.trace.system_message
                : `Constructed agentic prompt package for tools:\n${JSON.stringify(task.tools, null, 2)}`
            }
            userPrompt={
              outcome?.kind === "single"
                ? outcome.trace.user_prompt
                : task.prompt
            }
          />
        )}

        {activeTab === "trace" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!outcome ? (
              <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
                No trace recorded for this task yet. Run the batch to simulate.
              </div>
            ) : outcome.kind === "single" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Single turn trace */}
                <div style={turnStyle("single")}>
                  <div style={turnHeaderStyle("single")}>
                    🟢 TURN 1: Model Output (Raw text extracted)
                  </div>
                  <pre style={codeBlockStyle}>
                    {outcome.trace.raw_output || "(empty output)"}
                  </pre>
                </div>
                
                {/* Verdict */}
                <div style={verdictStyle(outcome.passed)}>
                  {outcome.passed ? (
                    <span>🟢 VERDICT: AST MATCH SUCCESS. {traceDiag(task, { id: taskId, category: task.category, verdict: outcome.trace.verdict }).msg}</span>
                  ) : (
                    <span>🛑 VERDICT: AST MATCH FAILED. {traceDiag(task, { id: taskId, category: task.category, verdict: outcome.trace.verdict }).msg}</span>
                  )}
                </div>
              </div>
            ) : outcome.kind === "agentic" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Chronological agentic turns */}
                {steps.length === 0 ? (
                  <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
                    No steps recorded for this multi-turn run yet.
                  </div>
                ) : (
                  steps.map((s, index) => {
                    const isError =
                      s.kind === "tool_error" ||
                      s.kind === "unknown_tool" ||
                      s.kind === "schema_error" ||
                      s.kind === "malformed_json" ||
                      s.kind === "hallucinated_completion" ||
                      s.kind === "infinite_loop";
                    
                    return (
                      <div key={index} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {/* Model Output Turn */}
                        <div style={turnStyle(isError ? "error" : "model")}>
                          <div style={turnHeaderStyle(isError ? "error" : "model")}>
                            {isError ? "🔴" : "🟢"} TURN {s.step_index + 1}: Model Output ({s.kind === "tool_call" ? "Raw text extracted" : `Error: ${s.kind}`})
                          </div>
                          <pre style={codeBlockStyle}>
                            └─► `{s.raw_output}`
                          </pre>
                        </div>

                        {/* Sandbox Intercept (if injection context present) */}
                        {s.injection && (
                          <div style={turnStyle("sandbox")}>
                            <div style={turnHeaderStyle("sandbox")}>
                              ⚙️ TURN {s.step_index + 1}: Sandbox Intercept
                            </div>
                            <pre style={codeBlockStyle}>
                              └─► Injected Context: `{s.injection}`
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Final Verdict */}
                {steps.length > 0 && (
                  <div
                    style={verdictStyle(
                      outcome.report.passes === outcome.report.total_runs
                    )}
                  >
                    {outcome.report.passes === outcome.report.total_runs ? (
                      <span>🟢 VERDICT: SUCCESS. All expected criteria and end-states met.</span>
                    ) : (
                      <span>
                        🛑 VERDICT: SEQUENCE VIOLATION. Sandbox rejected sequence or execution halted.
                        {outcome.report.top_error !== "none" && ` (Top Error: ${outcome.report.top_error})`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: "#fca5a5", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
                {outcome.message}
              </div>
            )}
          </div>
        )}

        {activeTab === "matcher" && (
          <div>
            {!outcome ? (
              <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
                No evaluation report available. Run the batch to evaluate.
              </div>
            ) : outcome.kind === "single" ? (
              <VerifyPhase
                verdict={outcome.trace.verdict}
                category={task.category}
              />
            ) : outcome.kind === "agentic" ? (
              <VerifyPhase
                verdict={{
                  parsed: outcome.report.failures.malformed_json_calls === 0,
                  tool_match: outcome.report.failures.infinite_loop_hits === 0,
                  args_match: outcome.report.passes === outcome.report.total_runs,
                  abstain_correct: null,
                }}
                category={task.category}
              />
            ) : (
              <div style={{ color: "#fca5a5", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
                Error loading matcher report.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, #121620 0%, #0d0f15 100%)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
  minHeight: 300,
};

const headerStyle: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  alignItems: "center",
};

const tabsContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "10px 20px 4px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  flexWrap: "wrap",
};

const tabBtnStyle: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer",
  borderWidth: 1,
  borderStyle: "solid",
  transition: "all 0.15s ease",
};

const turnStyle = (type: "single" | "model" | "error" | "sandbox"): React.CSSProperties => {
  let borderColor = "rgba(255,255,255,0.1)";
  if (type === "model" || type === "single") borderColor = "#22c55e";
  else if (type === "error") borderColor = "#ef4444";
  else if (type === "sandbox") borderColor = "#64748b";

  return {
    borderLeft: `3px solid ${borderColor}`,
    paddingLeft: 12,
  };
};

const turnHeaderStyle = (type: "single" | "model" | "error" | "sandbox"): React.CSSProperties => {
  let color = "#94a3b8";
  if (type === "model" || type === "single") color = "#4ade80";
  else if (type === "error") color = "#f87171";
  else if (type === "sandbox") color = "#94a3b8";

  return {
    fontSize: 11,
    fontWeight: 700,
    color,
    fontFamily: "Inter, sans-serif",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: 4,
  };
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: "#cbd5e1",
  fontFamily: "'JetBrains Mono', monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const verdictStyle = (passed: boolean): React.CSSProperties => {
  return {
    background: passed ? "rgba(34, 197, 94, 0.06)" : "rgba(239, 68, 68, 0.06)",
    border: `1px solid ${passed ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)"}`,
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: passed ? "#4ade80" : "#f87171",
    fontFamily: "Inter, sans-serif",
    marginTop: 8,
  };
};
