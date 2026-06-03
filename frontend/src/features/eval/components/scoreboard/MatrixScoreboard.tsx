import { useState } from "react";
import { useEvalRegistryStore } from "../../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useBatchStore } from "../../state/batchStore";
import { useBatchRun } from "../../hooks/useBatchRun";
import { modelLabel } from "../../../../shared/models/modelLabel";
import { toScoreRows } from "./scoreRows";

const panel: React.CSSProperties = {
  background: "linear-gradient(145deg, #1a1f2e 0%, #161b27 100%)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  overflow: "hidden",
};
const th: React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", padding: "8px 14px", fontFamily: "Inter,sans-serif" };
const td: React.CSSProperties = { fontSize: 13, color: "#e2e8f0", padding: "9px 14px", fontFamily: "Inter,sans-serif", borderTop: "1px solid rgba(255,255,255,0.05)" };
const ctl: React.CSSProperties = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#e2e8f0", fontSize: 12, padding: "5px 9px", fontFamily: "Inter,sans-serif" };

/// The Simulator: a per-MODEL results matrix (Pass^k · Avg Steps · Effort · Top
/// Error). Picks the collection + target models, drives one streaming batch via
/// `useBatchRun`, shows a live progress bar, and renders the matrix once the run
/// completes. Clicking a model row focuses it for the Trace Debugger below.
export function MatrixScoreboard({ onFocus }: { onFocus: (model: string) => void }) {
  const { presets, collections, selected, tasks, select } = useEvalRegistryStore();
  const list = useInstalledModelsStore((s) => s.list);
  const running = useBatchStore((s) => s.running);
  const progress = useBatchStore((s) => s.progress);
  const report = useBatchStore((s) => s.report);
  const error = useBatchStore((s) => s.error);
  const { run, stop } = useBatchRun();

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [k, setK] = useState(5);
  const [maxSteps, setMaxSteps] = useState(10);

  const rows = toScoreRows(report, list);
  const targets = list.filter((m) => picked.has(m.name)).map((m) => ({ model: m.name, backend: m.backend }));
  const canRun = targets.length > 0 && tasks.length > 0 && !running;

  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={panel} data-testid="matrix-scoreboard">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter,sans-serif", marginRight: 4 }}>Matrix Scoreboard</span>
        <select value={selected} onChange={(e) => void select(e.target.value)} style={ctl} data-testid="scoreboard-collection">
          {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          {collections.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          multiple
          value={[...picked]}
          onChange={(e) => toggle(e.target.value)}
          title="Target models (cmd/ctrl-click to multi-select)"
          style={{ ...ctl, minWidth: 150, height: 30 }}
          data-testid="scoreboard-models"
        >
          {list.map((m) => <option key={m.name} value={m.name}>{modelLabel(m)}</option>)}
        </select>
        <label style={{ fontSize: 11, color: "#94a3b8", fontFamily: "Inter,sans-serif" }}>
          K <input type="number" min={1} value={k} onChange={(e) => setK(Math.max(1, +e.target.value))} style={{ ...ctl, width: 52 }} data-testid="scoreboard-k" />
        </label>
        <label style={{ fontSize: 11, color: "#94a3b8", fontFamily: "Inter,sans-serif" }}>
          Max Steps <input type="number" min={1} value={maxSteps} onChange={(e) => setMaxSteps(Math.max(1, +e.target.value))} style={{ ...ctl, width: 52 }} data-testid="scoreboard-max-steps" />
        </label>
        {running ? (
          <button type="button" onClick={() => void stop()} style={{ ...ctl, color: "#fca5a5", cursor: "pointer" }} data-testid="scoreboard-stop">Stop</button>
        ) : (
          <button
            type="button"
            onClick={() => canRun && void run(selected, targets, tasks, k, maxSteps)}
            disabled={!canRun}
            style={{ ...ctl, background: canRun ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.03)", color: canRun ? "#93c5fd" : "#64748b", cursor: canRun ? "pointer" : "not-allowed" }}
            data-testid="scoreboard-run"
          >
            ▶ Run Batch
          </button>
        )}
      </div>

      {running && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }} data-testid="scoreboard-progress">
          <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "Inter,sans-serif", marginBottom: 4 }}>
            Running… {progress.done}/{progress.total || "?"}
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
            <div style={{ height: 4, width: `${pct}%`, background: "#3b82f6", borderRadius: 2, transition: "width 120ms" }} />
          </div>
        </div>
      )}

      {error && <div style={{ padding: "10px 16px", color: "#fca5a5", fontSize: 12, fontFamily: "Inter,sans-serif" }} data-testid="scoreboard-error">{error}</div>}

      {rows.length === 0 ? (
        <div style={{ padding: "22px 16px", color: "#64748b", fontSize: 13, fontFamily: "Inter,sans-serif" }}>
          Pick target models and run the batch to populate the matrix.
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="scoreboard-table">
          <thead>
            <tr>
              {["Model", "Quant", "Pass^k", "Avg Steps", "Effort", "Top Error"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.model} onClick={() => onFocus(r.model)} style={{ cursor: "pointer" }} data-testid={`scoreboard-row-${r.model}`}>
                <td style={td}>{r.label}</td>
                <td style={td}>{r.quant}</td>
                <td style={{ ...td, fontWeight: 600 }}>{r.passK}</td>
                <td style={td}>{r.avgSteps}</td>
                <td style={td}>{r.effort}</td>
                <td style={{ ...td, color: r.topError === "None" ? "#4ade80" : r.topError === "—" ? "#64748b" : "#fca5a5" }}>{r.topError}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
