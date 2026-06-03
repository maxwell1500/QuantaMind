import { useEffect, useState } from "react";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { EvalManager } from "./manager/EvalManager";
import { MatrixPanel } from "./matrix/MatrixPanel";
import { PipelinePanel } from "./pipeline/PipelinePanel";
import { ToolCallPanel } from "./ToolCallPanel";
import { ContextCliffPanel } from "./ContextCliffPanel";

type RunnerView = "scoreboard" | "debugger";
type Focus = { collection: string; taskId: string; model: string };

/// The Eval tab: the Eval Manager (author/run collections), the LLM Performance
/// Matrix (batch across models + regression history), the Eval Runner — a toggle
/// between the Batch Scoreboard (Simulator) and the single-task Trace Debugger
/// (Pipeline), wired so a row's "View Trace" hands that task to the debugger —
/// and the Context-Cliff probe.
export function EvalPage() {
  const initRegistry = useEvalRegistryStore((s) => s.init);
  const [view, setView] = useState<RunnerView>("scoreboard");
  const [focus, setFocus] = useState<Focus | null>(null);

  useEffect(() => {
    void initRegistry().catch(() => {});
  }, [initRegistry]);

  const onViewTrace = (f: Focus) => {
    setFocus(f);
    setView("debugger");
  };

  return (
    <div className="space-y-4" data-testid="eval-page">
      <EvalManager />
      <MatrixPanel onViewTrace={onViewTrace} />

      {/* Eval Runner: Batch Scoreboard ↔ single-task Trace Debugger */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Inter,sans-serif", marginRight: 4 }}>Eval Runner</span>
          {([["scoreboard", "Batch Scoreboard"], ["debugger", "Trace Debugger"]] as const).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              data-testid={`runner-tab-${v}`}
              style={{
                padding: "5px 14px",
                borderRadius: 7,
                border: "1px solid rgba(255,255,255,0.1)",
                background: view === v ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                color: view === v ? "#93c5fd" : "#94a3b8",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "Inter,sans-serif",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Both stay mounted (state survives the toggle); only the active one shows. */}
        <div style={{ display: view === "scoreboard" ? "block" : "none" }}>
          <ToolCallPanel onViewTrace={onViewTrace} />
        </div>
        <div style={{ display: view === "debugger" ? "block" : "none" }}>
          <PipelinePanel focus={focus} />
        </div>
      </div>

      <ContextCliffPanel />
    </div>
  );
}
