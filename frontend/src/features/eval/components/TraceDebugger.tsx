import { useEffect, useState } from "react";
import { useBatchStore, cellKey } from "../state/batchStore";
import type { TaskOutcome } from "../../../shared/ipc/eval/batch";
import { TrajectoryInspector } from "./trajectory/TrajectoryInspector";

const panel: React.CSSProperties = {
  background: "linear-gradient(145deg, #1a1f2e 0%, #161b27 100%)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  padding: 16,
};
const code: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#e2e8f0",
  fontFamily: "'JetBrains Mono','Fira Code',monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

// Stable empty array so the zustand selector never returns a fresh reference
// (which would loop getSnapshot).
const EMPTY: string[] = [];

function isFailure(o: TaskOutcome | undefined): boolean {
  if (!o) return false;
  if (o.kind === "single") return !o.passed;
  if (o.kind === "agentic") return o.report.passes < o.report.total_runs;
  return true; // error
}

/// The Evaluator: clicking a model row in the Scoreboard focuses it here. Shows
/// that model's per-task list (failures first), and for the selected task renders
/// the live agentic trajectory or the single-turn trace from the cached batch run.
export function TraceDebugger({ model }: { model: string | null }) {
  const tasksByModel = useBatchStore((s) => s.tasksByModel);
  const outcomeByKey = useBatchStore((s) => s.outcomeByKey);
  const stepsByKey = useBatchStore((s) => s.stepsByKey);
  const tasks = model ? (tasksByModel[model] ?? EMPTY) : EMPTY;
  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!model || tasks.length === 0) {
      setTaskId(null);
      return;
    }
    const firstFail = tasks.find((t) => isFailure(outcomeByKey[cellKey(model, t)]));
    setTaskId(firstFail ?? tasks[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, tasks.length]);

  if (!model) {
    return (
      <div style={panel} data-testid="trace-debugger">
        <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter,sans-serif" }}>
          Click a model row above to inspect its run trace.
        </div>
      </div>
    );
  }

  const outcome = taskId ? outcomeByKey[cellKey(model, taskId)] : undefined;

  return (
    <div style={panel} data-testid="trace-debugger">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {tasks.map((t) => {
          const fail = isFailure(outcomeByKey[cellKey(model, t)]);
          const active = t === taskId;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTaskId(t)}
              data-testid={`trace-task-${t}`}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                background: active ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.04)",
                color: fail ? "#fca5a5" : active ? "#93c5fd" : "#94a3b8",
                fontSize: 12,
                fontFamily: "Inter,sans-serif",
                cursor: "pointer",
              }}
            >
              {fail ? "🔴 " : ""}{t}
            </button>
          );
        })}
      </div>

      {!outcome ? (
        <div style={{ color: "#64748b", fontSize: 13, fontFamily: "Inter,sans-serif" }}>No trace for this task yet.</div>
      ) : outcome.kind === "agentic" ? (
        <TrajectoryInspector steps={taskId ? (stepsByKey[cellKey(model, taskId)] ?? []) : []} report={outcome.report} />
      ) : outcome.kind === "single" ? (
        <div data-testid="single-trace">
          <div style={{ fontSize: 12, fontWeight: 600, color: outcome.passed ? "#4ade80" : "#fca5a5", fontFamily: "Inter,sans-serif" }}>
            {outcome.passed ? "🟢 PASS" : "🔴 FAIL"}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter,sans-serif", marginTop: 8 }}>Model output</div>
          <pre style={code}>{outcome.trace.raw_output || "(empty)"}</pre>
        </div>
      ) : (
        <div style={{ color: "#fca5a5", fontSize: 13, fontFamily: "Inter,sans-serif" }} data-testid="trace-error">{outcome.message}</div>
      )}
    </div>
  );
}
