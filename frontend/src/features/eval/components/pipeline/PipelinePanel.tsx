import { useEffect, useState } from "react";
import { useEvalRegistryStore, DEFAULT_PRESET } from "../../state/evalRegistryStore";
import { getBuiltinCollection, loadCustomCollection, type ToolTask } from "../../../../shared/ipc/eval/registry";
import { traceToolcallTask, loadToolcallTrace, type TraceResult } from "../../../../shared/ipc/eval/toolcall";
import { isPassed } from "../../verdict";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { modelLabel } from "../../../../shared/models/modelLabel";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { ConfigPhase } from "./ConfigPhase";
import { SystemMessagePhase } from "./SystemMessagePhase";
import { StreamPhase } from "./StreamPhase";
import { VerifyPhase } from "./VerifyPhase";

const PHASES = ["Input Config", "System Pkg", "Stream", "Verify"] as const;

/// Single-task pipeline visualizer: pick a task + model, ▶ run it, and step
/// through Config → System Pkg → Stream → Verify with the REAL prompt + output.
/// `focus` is the Scoreboard handoff — when it changes, jump to that task/model.
export function PipelinePanel({
  focus,
}: {
  focus?: { collection: string; taskId: string; model: string } | null;
} = {}) {
  const { presets, collections, init } = useEvalRegistryStore();
  const list = useInstalledModelsStore((s) => s.list);

  const [active, setActive] = useState(DEFAULT_PRESET);
  const [tasks, setTasks] = useState<ToolTask[]>([]);
  const [taskId, setTaskId] = useState("");
  const [model, setModel] = useState("");
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);

  const isPreset = (id: string) => presets.some((p) => p.id === id);
  const task = tasks.find((t) => t.id === taskId) ?? null;
  const selectedModel = list.find((m) => m.name === model) ?? null;

  useEffect(() => {
    void init().catch((e) => console.error("eval registry init failed (PipelinePanel):", e));
  }, [init]);

  // Apply a Scoreboard/Matrix handoff: jump to the handed collection/task/model
  // and, if that run cached a trace, show it WITHOUT re-running inference. Keyed
  // on the value so a re-render with the same focus doesn't re-apply.
  const focusKey = focus ? `${focus.collection}|${focus.taskId}|${focus.model}` : "";
  useEffect(() => {
    if (!focus) return;
    setActive(focus.collection);
    setTaskId(focus.taskId);
    setModel(focus.model);
    setTrace(null);
    setFromCache(false);
    setPhase(0);
    let cancelled = false;
    (async () => {
      try {
        const cached = await loadToolcallTrace(focus.collection, focus.model, focus.taskId);
        if (!cancelled && cached) {
          setTrace(cached);
          setFromCache(true);
        }
      } catch {
        // No cache / load failed → user can press ▶ to run live.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  useEffect(() => {
    if (presets.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const t = isPreset(active) ? await getBuiltinCollection(active) : await loadCustomCollection(active);
        if (!cancelled) {
          setTasks(t);
          // Preserve the chosen task (e.g. from a handoff) if it exists in the
          // loaded set; otherwise fall back to the first task.
          setTaskId((prev) => (t.some((x) => x.id === prev) ? prev : t[0]?.id ?? ""));
          // Don't reset the trace here: a focus handoff changes `active`
          // programmatically and concurrently loads a cached trace — clearing it
          // would clobber that. Explicit collection changes reset via onChange.
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(formatIpcError(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, presets]);

  const handleRun = async () => {
    if (!selectedModel || !task) return;
    setRunning(true);
    setError(null);
    setTrace(null);
    setFromCache(false);
    setPhase(0);
    try {
      const tr = await traceToolcallTask(selectedModel.name, selectedModel.backend, task);
      setTrace(tr);
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setRunning(false);
    }
  };

  const handleReset = () => {
    setTrace(null);
    setFromCache(false);
    setPhase(0);
    setError(null);
  };

  const runDisabled = running || !selectedModel || !task;
  const execState = running ? "Running" : trace ? (fromCache ? "Cached" : "Complete") : "Idle";
  const validation = !trace
    ? "Pending"
    : isPassed({ id: taskId, category: task?.category ?? "single", verdict: trace.verdict })
      ? "PASSED"
      : "FAILED";

  const needsTrace = (
    <div style={{ padding: 24, textAlign: "center", color: "#475569", fontSize: 13, fontFamily: "Inter,sans-serif" }}>
      Press ▶ to run this task and reveal what the model received and returned.
    </div>
  );

  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10"
      style={{
        background: "linear-gradient(145deg, #1a1f2e 0%, #161b27 100%)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        display: "flex",
        flexDirection: "column",
      }}
      data-testid="pipeline-panel"
    >
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.01em" }}>
          LLM Tool-Calling Evaluator
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={runDisabled} onClick={() => void handleRun()} data-testid="pipeline-run" title="Run this task and trace it" style={roundBtn(runDisabled)}>
            {running ? <span style={{ fontSize: 9 }}>●●●</span> : <span style={{ marginLeft: 2 }}>▶</span>}
          </button>
          <button type="button" onClick={handleReset} data-testid="pipeline-reset" title="Reset" style={roundBtn(false)}>
            ↺
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "6px 20px" }}>
          <p style={{ fontSize: 11, color: "#f87171", fontFamily: "Inter,sans-serif", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, padding: "5px 10px" }} data-testid="pipeline-error">
            {error}
          </p>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <select value={active} onChange={(e) => { setActive(e.target.value); setTrace(null); setFromCache(false); setPhase(0); }} data-testid="pipeline-collection-select" style={selectStyle}>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          {collections.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={taskId} onChange={(e) => { setTaskId(e.target.value); setTrace(null); setFromCache(false); setPhase(0); }} data-testid="pipeline-task-select" style={selectStyle}>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
        </select>
        <select value={model} onChange={(e) => setModel(e.target.value)} data-testid="pipeline-model-select" style={selectStyle}>
          <option value="">Select model…</option>
          {list.map((m) => <option key={m.name} value={m.name}>{modelLabel(m)}</option>)}
        </select>
      </div>

      {/* Phase body */}
      <div style={{ padding: "14px 20px", minHeight: 220 }}>
        {phase === 0 && (task ? <ConfigPhase task={task} /> : <div style={{ color: "#475569", fontSize: 13, padding: 24, textAlign: "center" }}>No task selected.</div>)}
        {phase === 1 && (trace ? <SystemMessagePhase systemMessage={trace.system_message} userPrompt={trace.user_prompt} /> : needsTrace)}
        {phase === 2 && (trace || running ? <StreamPhase output={trace?.raw_output ?? ""} running={running} /> : needsTrace)}
        {phase === 3 && (trace ? <VerifyPhase verdict={trace.verdict} category={task?.category ?? "single"} /> : needsTrace)}
      </div>

      {/* Status rows */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "10px 0", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter,sans-serif" }}>Execution State</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter,sans-serif" }} data-testid="pipeline-exec-state">{execState}</div>
          {fromCache && !running && (
            <div style={{ fontSize: 10, color: "#64748b", fontFamily: "Inter,sans-serif", marginTop: 1 }} data-testid="pipeline-from-cache">
              from last run · ▶ to re-run
            </div>
          )}
        </div>
        <div style={{ padding: "10px 0", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter,sans-serif" }}>Validation</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: validation === "PASSED" ? "#4ade80" : validation === "FAILED" ? "#f87171" : "#64748b", fontFamily: "Inter,sans-serif" }} data-testid="pipeline-validation">{validation}</div>
        </div>
      </div>

      {/* Phase stepper */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px" }}>
        <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Inter,sans-serif" }}>Pipeline Phase</span>
        <button type="button" onClick={() => setPhase((p) => Math.max(0, p - 1))} disabled={phase === 0} data-testid="pipeline-prev" style={stepBtn(phase === 0)}>‹</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: "#cbd5e1", fontFamily: "Inter,sans-serif" }} data-testid="pipeline-phase-label">{PHASES[phase]}</div>
        <button type="button" onClick={() => setPhase((p) => Math.min(PHASES.length - 1, p + 1))} disabled={phase === PHASES.length - 1} data-testid="pipeline-next" style={stepBtn(phase === PHASES.length - 1)}>›</button>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, paddingBottom: 12 }}>
        {PHASES.map((_, i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i === phase ? "#3b82f6" : "rgba(255,255,255,0.15)" }} />
        ))}
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 7,
  color: "#94a3b8",
  fontSize: 12,
  fontFamily: "Inter,sans-serif",
  padding: "5px 10px",
  outline: "none",
  cursor: "pointer",
};

function roundBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)",
    background: disabled ? "rgba(255,255,255,0.04)" : "rgba(59,130,246,0.18)",
    color: disabled ? "#334155" : "#93c5fd",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0,
  };
}

function stepBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)",
    background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
    color: disabled ? "#334155" : "#94a3b8", fontSize: 14, cursor: disabled ? "not-allowed" : "pointer",
  };
}
