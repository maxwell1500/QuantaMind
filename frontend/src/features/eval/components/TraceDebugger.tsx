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

const turnHeaderTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#e2e8f0",
  fontFamily: "Inter, sans-serif",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const getStepIcon = (kind: string, isError: boolean) => {
  if (kind === "tool_call") return "⚙️";
  if (kind === "tool_error") return "🔴";
  if (kind === "schema_error") return "🟡";
  if (kind === "malformed_json") return "⚠️";
  if (kind === "infinite_loop") return "🔄";
  if (kind === "hallucinated_completion") return "🛑";
  if (kind === "end_state_reached") return "🏁";
  return isError ? "✖" : "✔";
};

const getStepTitle = (kind: string, isError: boolean) => {
  if (kind === "tool_call") return "Model Outputs Tool Call";
  if (kind === "tool_error") return "Injected Tool Fault (Driver B)";
  if (kind === "unknown_tool") return "Unknown Tool Triggered";
  if (kind === "schema_error") return "Schema Validation Error (Driver D)";
  if (kind === "malformed_json") return "Malformed JSON Generation";
  if (kind === "infinite_loop") return "Execution Loop Capped";
  if (kind === "hallucinated_completion") return "Hallucinated Stop Word";
  if (kind === "end_state_reached") return "End State Verification";
  return isError ? "Execution Failure" : "Model Output Success";
};

const getStepDescription = (kind: string, raw_output: string) => {
  if (kind === "schema_error") {
    return `[Schema validation failed]: ${raw_output}`;
  }
  return raw_output;
};

const getStepNodeStyle = (kind: string, isError: boolean): React.CSSProperties => {
  let bg = "rgba(34,197,94,0.15)";
  let border = "1px solid rgba(34,197,94,0.3)";
  let shadow = "0 0 8px rgba(34,197,94,0.15)";
  
  if (kind === "schema_error" || kind === "hallucinated_completion" || kind === "malformed_json") {
    bg = "rgba(234,179,8,0.15)";
    border = "1px solid rgba(234,179,8,0.35)";
    shadow = "0 0 8px rgba(234,179,8,0.15)";
  } else if (isError) {
    bg = "rgba(239,68,68,0.15)";
    border = "1px solid rgba(239,68,68,0.35)";
    shadow = "0 0 8px rgba(239,68,68,0.15)";
  } else if (kind === "end_state_reached") {
    bg = "rgba(168,85,247,0.15)";
    border = "1px solid rgba(168,85,247,0.35)";
    shadow = "0 0 8px rgba(168,85,247,0.15)";
  }
  
  return {
    position: "absolute",
    left: "-37px",
    top: "12px",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    background: bg,
    border: border,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    boxShadow: shadow,
    zIndex: 2,
  };
};

const getCardStyle = (kind: string, isError: boolean): React.CSSProperties => {
  let bg = "linear-gradient(135deg, rgba(34,197,94,0.03) 0%, rgba(34,197,94,0.01) 100%)";
  let border = "1px solid rgba(34,197,94,0.15)";
  
  if (kind === "schema_error" || kind === "hallucinated_completion" || kind === "malformed_json") {
    bg = "linear-gradient(135deg, rgba(234,179,8,0.04) 0%, rgba(234,179,8,0.01) 100%)";
    border = "1px solid rgba(234,179,8,0.2)";
  } else if (isError) {
    bg = "linear-gradient(135deg, rgba(239,68,68,0.05) 0%, rgba(239,68,68,0.01) 100%)";
    border = "1px solid rgba(239,68,68,0.2)";
  } else if (kind === "end_state_reached") {
    bg = "linear-gradient(135deg, rgba(168,85,247,0.04) 0%, rgba(168,85,247,0.01) 100%)";
    border = "1px solid rgba(168,85,247,0.18)";
  }
  
  return {
    background: bg,
    border: border,
    borderRadius: "12px",
    padding: "14px 16px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    transition: "all 0.2s",
  };
};

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
          background: isActive ? "rgba(59, 130, 246, 0.12)" : "rgba(255, 255, 255, 0.02)",
          color: isActive ? "#93c5fd" : "#94a3b8",
          borderColor: isActive ? "rgba(59, 130, 246, 0.3)" : "rgba(255, 255, 255, 0.08)",
          fontWeight: isActive ? 700 : 500,
        }}
        data-testid={`evaluator-tab-${id}`}
      >
        {isActive ? "● " : ""}
        {label}
      </button>
    );
  };

  return (
    <div
      className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl transition-all duration-300"
      style={panelStyle}
      data-testid="trace-debugger"
    >
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500" />
          <span style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", fontFamily: "Inter, sans-serif", letterSpacing: "0.03em" }}>
            3. THE EVALUATOR (Single-Task Pipeline Debugger)
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#3b82f6", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, marginLeft: 8 }}>
          [ {taskId} ]
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
              <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif", textAlign: "center", padding: 24 }}>
                No trace recorded for this task yet. Run the batch to simulate.
              </div>
            ) : outcome.kind === "single" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Single turn trace */}
                <div style={{ ...getCardStyle("tool_call", false), borderLeft: "4px solid #4ade80" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: 6 }}>
                    <span style={{ fontSize: 12 }}>🟢</span>
                    <span style={turnHeaderTitleStyle}>
                      TURN 1: Model Output (Raw text extracted)
                    </span>
                  </div>
                  <pre style={codeBlockStyle}>
                    {outcome.trace.raw_output || "(empty output)"}
                  </pre>
                </div>
                
                {/* Verdict */}
                <div style={verdictStyle(outcome.passed)}>
                  {outcome.passed ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>🟢</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>VERDICT: AST MATCH SUCCESS</div>
                        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                          {traceDiag(task, { id: taskId, category: task.category, verdict: outcome.trace.verdict }).msg}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>🛑</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>VERDICT: AST MATCH FAILED</div>
                        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                          {traceDiag(task, { id: taskId, category: task.category, verdict: outcome.trace.verdict }).msg}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : outcome.kind === "agentic" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Chronological agentic turns */}
                {steps.length === 0 ? (
                  <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif", textAlign: "center" }}>
                    No steps recorded for this multi-turn run yet.
                  </div>
                ) : (
                  <div style={timelineContainer}>
                    {steps.map((s, index) => {
                      const isError =
                        s.kind === "tool_error" ||
                        s.kind === "unknown_tool" ||
                        s.kind === "schema_error" ||
                        s.kind === "malformed_json" ||
                        s.kind === "hallucinated_completion" ||
                        s.kind === "infinite_loop";
                      
                      const icon = getStepIcon(s.kind, isError);
                      const title = getStepTitle(s.kind, isError);
                      const desc = getStepDescription(s.kind, s.raw_output);
                      
                      return (
                        <div key={index} style={{ position: "relative", marginBottom: index === steps.length - 1 ? 0 : 20 }}>
                          {/* Timeline node dot */}
                          <div style={getStepNodeStyle(s.kind, isError)}>
                            {icon}
                          </div>

                          {/* Card Content */}
                          <div style={getCardStyle(s.kind, isError)} className="hover:border-white/20 transition-all duration-200">
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)", paddingBottom: 6, marginBottom: 8 }}>
                              <span style={turnHeaderTitleStyle}>
                                TURN {s.step_index + 1}: {title}
                              </span>
                              {s.kind === "tool_call" && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                                  TOOL EXECUTION
                                </span>
                              )}
                              {s.kind === "schema_error" && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(234,179,8,0.15)", color: "#facc15" }}>
                                  SCHEMA FAILURE
                                </span>
                              )}
                              {s.kind === "tool_error" && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                                  FAULT INTERCEPTED
                                </span>
                              )}
                            </div>

                            <pre style={codeBlockStyle}>
                              {desc}
                            </pre>

                            {/* Sandbox Intercept (if injection context present) */}
                            {s.injection && (
                              <div style={sandboxInterceptCard}>
                                <div style={sandboxHeader}>
                                  ⚙️ Sandbox Response Injection
                                </div>
                                <pre style={sandboxBody}>
                                  {s.injection}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Final Verdict */}
                {steps.length > 0 && (
                  <div
                    style={verdictStyle(
                      outcome.report.passes === outcome.report.total_runs
                    )}
                  >
                    {outcome.report.passes === outcome.report.total_runs ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 24 }}>🏆</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>VERDICT: EVALUATION SUCCESS</div>
                          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>All checkpoints reached and expected end-state criteria fully met.</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 24 }}>⚠️</span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>VERDICT: SEQUENCE VIOLATION</div>
                          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                            Sandbox sequence rejected or budget exhausted.
                            {outcome.report.top_error !== "none" && (
                              <span style={{ fontWeight: 700, color: "#fca5a5", marginLeft: 4 }}>
                                (Reason: {outcome.report.top_error})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: "#fca5a5", fontSize: 13, fontFamily: "Inter, sans-serif", padding: "12px 14px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8 }}>
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
  background: "linear-gradient(145deg, #10141f 0%, #0a0d14 100%)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
  minHeight: 300,
};

const headerStyle: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  alignItems: "center",
};

const tabsContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "12px 20px 6px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  flexWrap: "wrap",
};

const tabBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer",
  borderWidth: 1,
  borderStyle: "solid",
  transition: "all 0.15s ease",
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: "#e2e8f0",
  fontFamily: "'JetBrains Mono', monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const verdictStyle = (passed: boolean): React.CSSProperties => {
  return {
    background: passed ? "rgba(34, 197, 94, 0.06)" : "rgba(239, 68, 68, 0.06)",
    border: `1px solid ${passed ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
    borderRadius: 12,
    padding: "14px 18px",
    fontSize: 13,
    fontWeight: 600,
    color: passed ? "#4ade80" : "#f87171",
    fontFamily: "Inter, sans-serif",
    marginTop: 8,
    boxShadow: passed ? "0 4px 16px rgba(34,197,94,0.1)" : "0 4px 16px rgba(239,68,68,0.1)",
  };
};

const timelineContainer: React.CSSProperties = {
  borderLeft: "2px dashed rgba(255, 255, 255, 0.1)",
  marginLeft: "18px",
  paddingLeft: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
  position: "relative",
};

const sandboxInterceptCard: React.CSSProperties = {
  marginTop: 10,
  background: "rgba(0,0,0,0.15)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 8,
  padding: "10px 12px",
};

const sandboxHeader: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#94a3b8",
  fontFamily: "Inter, sans-serif",
  letterSpacing: "0.04em",
  marginBottom: 6,
};

const sandboxBody: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  color: "#93c5fd",
  whiteSpace: "pre-wrap",
};
