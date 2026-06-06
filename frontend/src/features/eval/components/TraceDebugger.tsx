import { useState, useEffect } from "react";
import { useBatchStore, cellKey } from "../state/batchStore";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { traceDiag } from "../verdict";
import { ConfigPhase } from "./pipeline/ConfigPhase";
import { SystemMessagePhase } from "./pipeline/SystemMessagePhase";
import { VerifyPhase } from "./pipeline/VerifyPhase";
import { InfoButton } from "../../../shared/ui/InfoButton";
import { Spinner } from "../../../shared/ui/Spinner";
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
  color: "#475569",
  fontFamily: "Inter, sans-serif",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const GearIcon = () => (
  <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const ErrorIcon = () => (
  <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const CheckIcon = () => (
  <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const LoopIcon = () => (
  <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3" />
  </svg>
);

const StopIcon = () => (
  <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);

const FlagIcon = () => (
  <svg style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
  </svg>
);

const getStepIcon = (kind: string, isError: boolean): React.ReactNode => {
  if (kind === "tool_call") return <GearIcon />;
  if (kind === "tool_error" || kind === "schema_error" || kind === "malformed_json") return <ErrorIcon />;
  if (kind === "infinite_loop") return <LoopIcon />;
  if (kind === "hallucinated_completion") return <StopIcon />;
  if (kind === "end_state_reached") return <FlagIcon />;
  return isError ? <ErrorIcon /> : <CheckIcon />;
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
  let bg = "#f0fdf4";
  let border = "1px solid #bbf7d0";
  let color = "#166534";
  
  if (kind === "schema_error" || kind === "hallucinated_completion" || kind === "malformed_json") {
    bg = "#fffbeb";
    border = "1px solid #fef3c7";
    color = "#b45309";
  } else if (isError) {
    bg = "#fef2f2";
    border = "1px solid #fee2e2";
    color = "#991b1b";
  } else if (kind === "end_state_reached") {
    bg = "#faf5ff";
    border = "1px solid #f3e8ff";
    color = "#6b21a8";
  } else if (kind === "tool_call") {
    bg = "#eff6ff";
    border = "1px solid #dbeafe";
    color = "#1d4ed8";
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
    color: color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  };
};

const getCardStyle = (kind: string, isError: boolean): React.CSSProperties => {
  let bg = "#ffffff";
  let border = "1px solid #e2e8f0";
  let borderLeft = "3px solid #10b981";
  
  if (kind === "schema_error" || kind === "hallucinated_completion" || kind === "malformed_json") {
    bg = "#fffbeb";
    border = "1px solid #fef3c7";
    borderLeft = "3px solid #f59e0b";
  } else if (isError) {
    bg = "#fef2f2";
    border = "1px solid #fee2e2";
    borderLeft = "3px solid #ef4444";
  } else if (kind === "end_state_reached") {
    bg = "#faf5ff";
    border = "1px solid #f3e8ff";
    borderLeft = "3px solid #a855f7";
  } else if (kind === "tool_call") {
    bg = "#ffffff";
    border = "1px solid #e2e8f0";
    borderLeft = "3px solid #3b82f6";
  }
  
  return {
    background: bg,
    border: border,
    borderLeft: borderLeft,
    borderRadius: "12px",
    padding: "14px 16px",
    boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.02)",
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
  const running = useBatchStore((s) => s.running);

  const [activeTab, setActiveTab] = useState<TabType>("trace");
  const [collapsed, setCollapsed] = useState(false);

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
        className="rounded-xl overflow-hidden border border-slate-200"
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
          background: isActive ? "#eff6ff" : "#ffffff",
          color: isActive ? "#2563eb" : "#475569",
          borderColor: isActive ? "#bfdbfe" : "#e2e8f0",
          fontWeight: isActive ? 600 : 500,
        }}
        data-testid={`evaluator-tab-${id}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm transition-all duration-300"
      // Drop the 300px floor when collapsed so the panel shrinks to its header instead
      // of leaving a tall blank white box.
      style={{ ...panelStyle, minHeight: collapsed ? undefined : panelStyle.minHeight }}
      data-testid="trace-debugger"
    >
      {/* Header — the chevron + title is one big toggle button (clear hit target). */}
      <div style={headerStyle}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          data-testid="evaluator-collapse"
          title={collapsed ? "Expand the Evaluator" : "Collapse"}
          style={collapseToggleStyle}
        >
          <span style={chevronStyle} aria-hidden>{collapsed ? "▸" : "▾"}</span>
          <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "Inter, sans-serif", letterSpacing: "0.03em" }}>
            3. THE EVALUATOR (Single-Task Pipeline Debugger)
          </span>
        </button>
        <span style={{ fontSize: 12, color: "#475569", background: "#f1f5f9", padding: "2px 8px", borderRadius: 6, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, marginLeft: 8 }}>
          {taskId}
        </span>
        {collapsed && (
          <span data-testid="evaluator-collapsed-summary" style={{ marginLeft: 10, fontSize: 12, color: "#64748b", fontFamily: "Inter, sans-serif" }}>
            · click to expand
          </span>
        )}
        {running && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 10, fontSize: 12, color: "#2563eb", fontFamily: "Inter, sans-serif", fontWeight: 600 }} data-testid="evaluator-running">
            <Spinner /> Running…
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          <InfoButton {...TOOL_HELP.evaluator} testId="evaluator" />
        </span>
      </div>

      {collapsed ? null : (
      <>
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
                <div style={{ ...getCardStyle("tool_call", false) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, borderBottom: "1px solid #e2e8f0", paddingBottom: 6 }}>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
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
                      <span style={{ color: "#166534", display: "inline-flex", alignItems: "center" }}>
                        <CheckIcon />
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#166534" }}>VERDICT: AST MATCH SUCCESS</div>
                        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2, color: "#166534" }}>
                          {traceDiag(task, { id: taskId, category: task.category, verdict: outcome.trace.verdict }).msg}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "#991b1b", display: "inline-flex", alignItems: "center" }}>
                        <ErrorIcon />
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#991b1b" }}>VERDICT: AST MATCH FAILED</div>
                        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2, color: "#991b1b" }}>
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
                          <div style={getCardStyle(s.kind, isError)} className="hover:border-slate-300 transition-all duration-200">
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: 6, marginBottom: 8 }}>
                              <span style={turnHeaderTitleStyle}>
                                TURN {s.step_index + 1}: {title}
                              </span>
                              {s.kind === "tool_call" && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #dbeafe" }}>
                                  TOOL EXECUTION
                                </span>
                              )}
                              {s.kind === "schema_error" && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fffbeb", color: "#b45309", border: "1px solid #fef3c7" }}>
                                  SCHEMA FAILURE
                                </span>
                              )}
                              {s.kind === "tool_error" && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fef2f2", color: "#991b1b", border: "1px solid #fee2e2" }}>
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
                                  Sandbox Response Injection
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
                        <span style={{ color: "#166534", display: "inline-flex", alignItems: "center" }}>
                          <CheckIcon />
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#166534" }}>VERDICT: EVALUATION SUCCESS</div>
                          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2, color: "#166534" }}>All checkpoints reached and expected end-state criteria fully met.</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ color: "#991b1b", display: "inline-flex", alignItems: "center" }}>
                          <ErrorIcon />
                        </span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#991b1b" }}>VERDICT: SEQUENCE VIOLATION</div>
                          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2, color: "#991b1b" }}>
                            Sandbox sequence rejected or budget exhausted.
                            {outcome.report.top_error !== "none" && (
                              <span style={{ fontWeight: 700, color: "#991b1b", marginLeft: 4 }}>
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
              <div style={{ color: "#b91c1c", fontSize: 13, fontFamily: "Inter, sans-serif", padding: "12px 14px", background: "#fef2f2", border: "1px solid #fee2e2", borderRadius: 8 }}>
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
              <div style={{ color: "#b91c1c", fontSize: 13, fontFamily: "Inter, sans-serif" }}>
                Error loading matcher report.
              </div>
            )}
          </div>
        )}
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
  minHeight: 300,
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
  gap: 8,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 0,
  textAlign: "left",
};

/// The visible disclosure chevron — a 22px rounded chip so it reads as a control,
/// not a stray glyph (mirrors the Simulator header).
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

const tabsContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "12px 20px 6px",
  borderBottom: "1px solid #e2e8f0",
  flexWrap: "wrap",
  background: "#ffffff",
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
  color: "#334155",
  fontFamily: "'JetBrains Mono', monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const verdictStyle = (passed: boolean): React.CSSProperties => {
  return {
    background: passed ? "#f0fdf4" : "#fef2f2",
    border: `1px solid ${passed ? "#bbf7d0" : "#fee2e2"}`,
    borderRadius: 12,
    padding: "14px 18px",
    fontSize: 13,
    fontWeight: 600,
    color: passed ? "#166534" : "#991b1b",
    fontFamily: "Inter, sans-serif",
    marginTop: 8,
  };
};

const timelineContainer: React.CSSProperties = {
  borderLeft: "2px dashed #cbd5e1",
  marginLeft: "18px",
  paddingLeft: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
  position: "relative",
};

const sandboxInterceptCard: React.CSSProperties = {
  marginTop: 10,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "10px 12px",
};

const sandboxHeader: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#64748b",
  fontFamily: "Inter, sans-serif",
  letterSpacing: "0.04em",
  marginBottom: 6,
};

const sandboxBody: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontFamily: "'JetBrains Mono', monospace",
  color: "#2563eb",
  whiteSpace: "pre-wrap",
};
