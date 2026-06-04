import { useState, useCallback, useRef, useEffect } from "react";
import { runToolcallEval, type ToolCallReport, type ToolTaskResult } from "../../../shared/ipc/eval/toolcall";
import { useEvalRegistryStore, DEFAULT_PRESET } from "../state/evalRegistryStore";
import { getBuiltinCollection, loadCustomCollection, type ToolTask } from "../../../shared/ipc/eval/registry";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { modelLabel } from "../../../shared/models/modelLabel";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { scoreLabel, isPassed, traceDiag, passedBadge, failedBadge, pendingBadge } from "../verdict";

// ── Helpers ────────────────────────────────────────────────────────────────────

const pct = (n: number | null, d: number) =>
  d === 0 ? "—" : n == null ? "n/a" : `${Math.round((n / d) * 100)}%`;

function taskLabel(id: string): string {
  return id
    .replace(/^(single|select|parallel|abstain)-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Bar chart ──────────────────────────────────────────────────────────────────

function EvalBarChart({
  results,
  running,
}: {
  results: ToolTaskResult[];
  running: boolean;
}) {
  const categories = ["single", "select", "parallel", "abstain"];
  const chartW = 540;
  const chartH = 160;
  const padL = 56;
  const padB = 24;
  const padT = 24;
  const padR = 16;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padB - padT;
  const barCount = categories.length;
  const barGroup = innerW / barCount;
  const barW = Math.max(30, barGroup * 0.52);

  const maxVal = Math.max(
    ...categories.map((cat) => results.filter((r) => r.category === cat).length),
    4,
  );
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <svg width={chartW} height={chartH} style={{ overflow: "visible" }} aria-label="Eval bar chart">
      {/* Legend */}
      <g transform={`translate(${padL}, 6)`}>
        <rect x={0} y={0} width={10} height={10} fill="#4ade80" rx={2} />
        <text x={14} y={9} fontSize={10} fill="#94a3b8" fontFamily="Inter,sans-serif">
          Passed
        </text>
        <rect x={60} y={0} width={10} height={10} fill="#60a5fa" rx={2} />
        <text x={74} y={9} fontSize={10} fill="#94a3b8" fontFamily="Inter,sans-serif">
          Failed
        </text>
      </g>

      {/* Y label */}
      <text
        transform={`translate(12,${padT + innerH / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize={10}
        fill="#64748b"
        fontFamily="Inter,sans-serif"
      >
        Passed
      </text>

      {/* Grid + ticks */}
      {yTicks.map((v) => {
        const yPos = padT + innerH - (maxVal > 0 ? (v / maxVal) * innerH : 0);
        return (
          <g key={v}>
            <line x1={padL} x2={padL + innerW} y1={yPos} y2={yPos} stroke="rgba(255,255,255,0.06)" />
            <text x={padL - 5} y={yPos} dy="0.35em" textAnchor="end" fontSize={9} fill="#475569" fontFamily="Inter,sans-serif">
              {v}
            </text>
          </g>
        );
      })}

      {/* Baseline */}
      <line x1={padL} x2={padL + innerW} y1={padT + innerH} y2={padT + innerH} stroke="rgba(255,255,255,0.12)" />

      {/* Bars */}
      {categories.map((cat, i) => {
        const catResults = results.filter((r) => r.category === cat);
        const passedN = catResults.filter(isPassed).length;
        const failedN = catResults.length - passedN;
        const cx = padL + i * barGroup + barGroup / 2;
        const x = cx - barW / 2;
        const baseY = padT + innerH;
        const passedH = maxVal > 0 ? (passedN / maxVal) * innerH : 0;
        const failedH = maxVal > 0 ? (failedN / maxVal) * innerH : 0;
        const minBarH = catResults.length > 0 ? 2 : 0; // thin line to show category exists

        return (
          <g key={cat}>
            {/* Empty category placeholder */}
            {catResults.length === 0 && !running && (
              <line x1={cx} x2={cx} y1={baseY - 4} y2={baseY} stroke="rgba(255,255,255,0.08)" strokeWidth={barW} />
            )}
            {/* Passed bar (green) */}
            {passedN > 0 && (
              <rect
                x={x}
                y={baseY - passedH - failedH}
                width={barW}
                height={Math.max(passedH, minBarH)}
                fill="#4ade80"
                rx={3}
              />
            )}
            {/* Failed bar (blue) */}
            {failedN > 0 && (
              <rect
                x={x}
                y={baseY - failedH}
                width={barW}
                height={Math.max(failedH, minBarH)}
                fill="#60a5fa"
                rx={passedN === 0 ? 3 : 0}
              />
            )}
            {/* Running skeleton bar */}
            {running && catResults.length === 0 && (
              <rect x={x} y={baseY - 8} width={barW} height={8} fill="rgba(255,255,255,0.06)" rx={2} />
            )}
            {/* Label */}
            <text x={cx} y={baseY + 14} textAnchor="middle" fontSize={9} fill="#475569" fontFamily="Inter,sans-serif">
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

/// Tool-Calling Evaluation Simulator — the batch scoreboard: runs the selected
/// collection against one model and shows a per-task results table, a pass/fail
/// bar chart, and the aggregate sub-scores + composite. (The single-task,
/// real-prompt/real-output step-through lives in the Pipeline visualizer.)
export function ToolCallPanel({
  onViewTrace,
}: {
  onViewTrace?: (f: { collection: string; taskId: string; model: string }) => void;
} = {}) {
  const list = useInstalledModelsStore((s) => s.list);
  const { presets, collections, init } = useEvalRegistryStore();

  const [active, setActive] = useState(DEFAULT_PRESET);
  const [tasks, setTasks] = useState<ToolTask[]>([]);
  const [model, setModel] = useState("");
  const [completedResults, setCompletedResults] = useState<ToolTaskResult[]>([]);
  const [summary, setSummary] = useState<ToolCallReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelType, setModelType] = useState<"instruct" | "base">("instruct");
  const [speed, setSpeed] = useState(50);
  const cancelRef = useRef(false);

  const selected = list.find((m) => m.name === model);
  const isPreset = (id: string) => presets.some((p) => p.id === id);

  useEffect(() => {
    void init().catch(() => {});
  }, [init]);

  // Load the chosen collection's tasks itself (preset OR custom) so the Simulator
  // can batch ANY collection, not just whatever the editor happens to have open.
  useEffect(() => {
    if (presets.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const t = isPreset(active) ? await getBuiltinCollection(active) : await loadCustomCollection(active);
        if (!cancelled) {
          setTasks(t);
          setCompletedResults([]);
          setSummary(null);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(formatIpcError(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, presets]);

  const run = useCallback(async () => {
    if (!selected || tasks.length === 0) return;
    setRunning(true);
    setError(null);
    setCompletedResults([]);
    setSummary(null);
    cancelRef.current = false;

    try {
      // Run tasks one-at-a-time for live status updates.
      for (let i = 0; i < tasks.length; i++) {
        if (cancelRef.current) break;
        try {
          const report = await runToolcallEval(selected.name, selected.backend, [tasks[i]], active);
          if (!cancelRef.current) {
            setSummary(report);
            if (report.per_task.length > 0) {
              setCompletedResults((prev) => [...prev, ...report.per_task]);
            }
          }
        } catch (e) {
          if (!cancelRef.current) {
            setError(formatIpcError(e));
            cancelRef.current = true;
          }
          break;
        }
      }
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setRunning(false);
    }
  }, [selected, tasks, active]);

  const reset = () => {
    cancelRef.current = true;
    setRunning(false);
    setCompletedResults([]);
    setSummary(null);
    setError(null);
  };

  // Derived stats (live)
  const passedN = completedResults.filter(isPassed).length;
  const accuracy = summary?.composite != null ? scoreLabel(summary.composite) : completedResults.length > 0 ? pct(passedN, completedResults.length) : "—";

  const taskLabelMap = Object.fromEntries(tasks.map((t) => [t.id, taskLabel(t.id)]));

  // Determine row status for each task
  const getRowStatus = (taskId: string) => {
    const result = completedResults.find((r) => r.id === taskId);
    if (result) return { state: isPassed(result) ? "passed" : "failed" as const, result };
    const idx = tasks.findIndex((t) => t.id === taskId);
    const isCurrentlyRunning = running && idx === completedResults.length;
    return { state: isCurrentlyRunning ? "running" : "pending" as const, result: null };
  };

  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10"
      style={{
        background: "linear-gradient(145deg, #1a1f2e 0%, #161b27 100%)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
      data-testid="toolcall-panel"
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: "#e2e8f0", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
          >
            Tool-Calling Evaluation Simulator
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3 }}>
            <select
              value={active}
              onChange={(e) => setActive(e.target.value)}
              data-testid="toolcall-collection-select"
              style={headerSelect}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              {collections.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              data-testid="toolcall-model-select"
              style={headerSelect}
            >
              <option value="">Select a model…</option>
              {list.map((m) => (
                <option key={m.name} value={m.name}>
                  {modelLabel(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {/* ▶ Run */}
          <button
            type="button"
            disabled={!selected || running || tasks.length === 0}
            onClick={() => void run()}
            data-testid="toolcall-run"
            title="Run eval"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.12)",
              background:
                !selected || tasks.length === 0
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(59,130,246,0.15)",
              color: !selected || tasks.length === 0 ? "#334155" : "#93c5fd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              cursor: !selected || running || tasks.length === 0 ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              flexShrink: 0,
            }}
          >
            {running ? (
              <span style={{ fontSize: 9, letterSpacing: 1, color: "#93c5fd" }}>●●●</span>
            ) : (
              <span style={{ marginLeft: 2 }}>▶</span>
            )}
          </button>

          {/* ↺ Reset */}
          <button
            type="button"
            onClick={reset}
            title="Reset"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: running
                ? "2px solid #3b82f6"
                : "1px solid rgba(255,255,255,0.12)",
              background: running ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.07)",
              color: running ? "#3b82f6" : "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              cursor: "pointer",
              transition: "all 0.2s",
              flexShrink: 0,
              animation: running ? "spin 1.2s linear infinite" : "none",
            }}
          >
            ↺
          </button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ padding: "0 20px 8px" }}>
          <p
            style={{
              fontSize: 11,
              color: "#f87171",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: 6,
              padding: "6px 10px",
            }}
            data-testid="toolcall-error"
          >
            Not available — {error}
          </p>
        </div>
      )}

      {/* ── Evaluation Table ───────────────────────────────────────────────── */}
      <div style={{ paddingBottom: 4 }}>
        <table
          style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}
          data-testid="toolcall-table"
        >
          <thead>
            <tr>
              {["Evaluation Task", "Status", "Trace Diagnostics", ...(onViewTrace ? ["Action"] : [])].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "7px 20px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#475569",
                    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                    letterSpacing: "0.04em",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.length > 0
              ? (completedResults.length > 0 ? completedResults : tasks).map((entry, i) => {
                  const taskId = entry.id;
                  const task = tasks.find((t) => t.id === taskId);
                  const result = completedResults.find((r) => r.id === taskId) ?? null;
                  const state = result
                    ? isPassed(result)
                      ? "passed"
                      : "failed"
                    : getRowStatus(taskId).state;
                  const isEven = i % 2 === 0;
                  const diag =
                    result
                      ? traceDiag(task ?? null, result)
                      : state === "running"
                        ? { ok: null, msg: "⟳ Running inference…" }
                        : { ok: null, msg: "Waiting for execution…" };

                  return (
                    <tr
                      key={taskId}
                      style={{
                        background:
                          state === "running"
                            ? "rgba(59,130,246,0.05)"
                            : isEven
                              ? "rgba(255,255,255,0.012)"
                              : "transparent",
                      }}
                      data-testid={`toolcall-row-${taskId}`}
                    >
                      {/* Task name */}
                      <td
                        style={{
                          padding: "9px 20px",
                          fontSize: 13,
                          color: state === "pending" && !running ? "#475569" : "#cbd5e1",
                          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {taskLabelMap[taskId] ?? taskId}
                      </td>

                      {/* Status badge */}
                      <td
                        style={{
                          padding: "9px 20px",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {state === "passed" && <span style={passedBadge}>Passed</span>}
                        {state === "failed" && <span style={failedBadge}>Failed</span>}
                        {state === "running" && <span style={pendingBadge}>Running…</span>}
                        {state === "pending" && <span style={pendingBadge}>Pending</span>}
                      </td>

                      {/* Diagnostics */}
                      <td
                        style={{
                          padding: "9px 20px",
                          fontSize: 12,
                          color:
                            diag.ok === true
                              ? "#6ee7b7"
                              : diag.ok === false
                                ? "#fca5a5"
                                : "#475569",
                          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}
                      >
                        {diag.msg}
                      </td>

                      {/* View Trace handoff */}
                      {onViewTrace && (
                        <td style={{ padding: "9px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => onViewTrace({ collection: active, taskId, model })}
                            data-testid={`toolcall-view-trace-${taskId}`}
                            style={{
                              padding: "3px 10px",
                              borderRadius: 6,
                              border: "1px solid rgba(255,255,255,0.12)",
                              background: "rgba(255,255,255,0.05)",
                              color: "#93c5fd",
                              fontSize: 11,
                              fontFamily: "Inter,sans-serif",
                              cursor: "pointer",
                            }}
                          >
                            View Trace
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              : // Empty state placeholder rows
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "rgba(255,255,255,0.012)" : "transparent" }}>
                    <td style={skeletonTd}>
                      <div style={{ height: 11, width: `${55 + i * 18}px`, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
                    </td>
                    <td style={skeletonTd}>
                      <div style={{ height: 11, width: 44, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
                    </td>
                    <td style={skeletonTd}>
                      <div style={{ height: 11, width: 160, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
                    </td>
                    {onViewTrace && (
                      <td style={skeletonTd}>
                        <div style={{ height: 11, width: 70, background: "rgba(255,255,255,0.06)", borderRadius: 3 }} />
                      </td>
                    )}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* ── Bar Chart ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 20px 4px" }}>
        <EvalBarChart results={completedResults} running={running} />
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      {!error && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            borderTop: "1px solid rgba(255,255,255,0.07)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
          data-testid="toolcall-scores"
        >
          {[
            { label: "Parse", value: summary ? scoreLabel(summary.parse_rate) : "n/a" },
            { label: "Tool", value: summary ? scoreLabel(summary.tool_selection_acc) : "n/a" },
            { label: "Args", value: summary ? scoreLabel(summary.arg_acc) : "n/a" },
            { label: "Abstain", value: summary ? scoreLabel(summary.abstain_acc) : "n/a" },
            { label: "Composite", value: accuracy },
          ].map(({ label, value }, idx) => (
            <div
              key={label}
              style={{
                padding: "12px 0",
                textAlign: "center",
                borderRight: idx < 4 ? "1px solid rgba(255,255,255,0.07)" : "none",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter,sans-serif" }}>
                {label} {value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Model Toggle + Speed ───────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Model toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Inter,sans-serif" }}>
            Model
          </span>
          <div
            style={{
              display: "flex",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 22,
              padding: 3,
            }}
          >
            {(["instruct", "base"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setModelType(type)}
                style={{
                  padding: "4px 18px",
                  borderRadius: 18,
                  border: "none",
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: "Inter,sans-serif",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background:
                    modelType === type
                      ? "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)"
                      : "transparent",
                  color: modelType === type ? "#e0e7ff" : "#64748b",
                  boxShadow: modelType === type ? "0 2px 8px rgba(29,78,216,0.35)" : "none",
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Speed slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Inter,sans-serif" }}>
            Speed
          </span>
          <input
            type="range"
            min={1}
            max={100}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ width: 130, accentColor: "#3b82f6", cursor: "pointer" }}
          />
          <span style={{ fontSize: 12, color: "#e2e8f0", fontFamily: "Inter,sans-serif", minWidth: 24, textAlign: "right" }}>
            {speed}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Shared micro-styles ────────────────────────────────────────────────────────

const skeletonTd: React.CSSProperties = {
  padding: "10px 20px",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};

const headerSelect: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#64748b",
  fontSize: 12,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  outline: "none",
  cursor: "pointer",
  padding: 0,
};
