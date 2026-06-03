import { useEffect, useState } from "react";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { modelLabel } from "../../../shared/models/modelLabel";
import { useEvalRegistryStore, DEFAULT_PRESET } from "../state/evalRegistryStore";
import { getBuiltinCollection, loadCustomCollection, type ToolTask } from "../../../shared/ipc/eval/registry";
import { useVramFit } from "../../quant/useVramFit";
import { useContextCliff } from "../hooks/useContextCliff";
import { cliffPoint } from "../cliff";
import { ContextCliffChart } from "./ContextCliffChart";

const FALLBACK_MAX_TOKENS = 65536; // slider ceiling when the model context window is unknown

/// Context-Cliff probe: runs a chosen dataset at growing prompt lengths and
/// graphs where tool-call accuracy collapses. Frontend-only, padding is
/// approximate (≈tokens) — labelled indicative, not a tokenizer. Owns its own
/// collection selection so it never depends on the EvalManager editor.
export function ContextCliffPanel() {
  const list = useInstalledModelsStore((s) => s.list);
  const { presets, collections, init } = useEvalRegistryStore();
  const [active, setActive] = useState(DEFAULT_PRESET);
  const [tasks, setTasks] = useState<ToolTask[]>([]);
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState(16384);
  const [testSteps, setTestSteps] = useState(5);
  const selected = list.find((m) => m.name === model);

  const isPreset = (id: string) => presets.some((p) => p.id === id);

  useEffect(() => {
    void init().catch(() => {});
  }, [init]);

  // Load the chosen collection's tasks itself (preset OR custom) so the probe
  // always has a real dataset to run — independent of the editor.
  useEffect(() => {
    if (presets.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const t = isPreset(active) ? await getBuiltinCollection(active) : await loadCustomCollection(active);
        if (!cancelled) setTasks(t);
      } catch {
        if (!cancelled) setTasks([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, presets]);

  // Cap the padding ladder at the model's real context window when known
  // (Ollama /api/show dims); fall back to a fixed ceiling otherwise.
  const { dims } = useVramFit(selected?.name, selected?.backend, maxTokens);
  const sliderMax = dims?.context_length ? Math.max(4096, dims.context_length) : FALLBACK_MAX_TOKENS;
  useEffect(() => {
    setMaxTokens((m) => Math.min(m, sliderMax));
  }, [sliderMax]);

  const { points, running, error, run, reset } = useContextCliff(
    selected?.name ?? "",
    selected?.backend ?? "ollama",
    tasks,
    maxTokens,
    testSteps,
  );
  const cliff = cliffPoint(points);
  const maintainedTo = points.reduce(
    (mx, p) => (p.composite != null && p.promptTokens != null && p.promptTokens > mx ? p.promptTokens : mx),
    0,
  );

  const handleRun = () => void run();
  const handleReset = () => reset();

  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10"
      style={{
        background: "linear-gradient(145deg, #1a1f2e 0%, #161b27 100%)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
      data-testid="cliff-panel"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: "#e2e8f0", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
          >
            Context-Cliff Diagnostic Probe
          </h2>
          <select
            value={active}
            onChange={(e) => { setActive(e.target.value); reset(); }}
            data-testid="cliff-collection-select"
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: 12,
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              outline: "none",
              cursor: "pointer",
              padding: 0,
              marginTop: 3,
            }}
          >
            {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            {collections.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={handleReset}
          title="Reset"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#94a3b8",
            width: 36,
            height: 36,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            cursor: "pointer",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.07)")}
        >
          ↺
        </button>
      </div>

      {/* ── Error (a backend failure is shown, never a silent blank chart) ── */}
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
            data-testid="cliff-error"
          >
            Not available — {error}
          </p>
        </div>
      )}

      {/* ── Chart ── */}
      <div className="px-4 pb-2">
        {points.length > 0 ? (
          <ContextCliffChart points={points} width={580} height={220} />
        ) : (
          <div
            style={{
              width: 580,
              height: 220,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(148,163,184,0.4)",
              fontSize: 13,
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              letterSpacing: "0.02em",
            }}
          >
            {running ? "Probing…" : "Run the probe to see results"}
          </div>
        )}
      </div>

      {/* ── Results Table ── */}
      {points.length > 0 && (
        <div className="px-5 pb-3">
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {["Step", "Tokens", "Accuracy", "Status"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#64748b",
                      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                      borderBottom: "1px solid rgba(255,255,255,0.07)",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => {
                const pct = p.composite != null ? `${(p.composite * 100).toFixed(1)}%` : "—";
                const passed = p.composite != null && p.composite >= 0.5;
                const failed = p.composite != null && p.composite < 0.5;
                const isEven = i % 2 === 0;

                return (
                  <tr
                    key={i}
                    style={{
                      background: isEven
                        ? "rgba(255,255,255,0.02)"
                        : "transparent",
                    }}
                  >
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={tdStyle}>
                      {p.promptTokens != null ? Math.round(p.promptTokens).toLocaleString() : "Not available"}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#e2e8f0" }}>{pct}</td>
                    <td style={tdStyle}>
                      {passed && (
                        <span style={passChipStyle}>
                          <span style={{ fontSize: 13 }}>✅</span> Pass
                        </span>
                      )}
                      {failed && (
                        <span style={failChipStyle}>
                          <span style={{ fontSize: 13 }}>⚠️</span> Failure
                        </span>
                      )}
                      {p.composite == null && (
                        <span style={{ color: "#64748b", fontSize: 12 }}>Error</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Divider ── */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0 0" }} />

      {/* ── Model & Status Row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          padding: "14px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              marginBottom: 4,
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Model
          </div>
          <div style={{ fontSize: 13, color: "#94a3b8", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
            {selected ? modelLabel(selected) : (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                data-testid="cliff-model-select"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#94a3b8",
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 12,
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="">Select a model…</option>
                {list.map((m) => (
                  <option key={m.name} value={m.name}>
                    {modelLabel(m)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              color: "#64748b",
              marginBottom: 4,
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Status
          </div>
          <div
            style={{ fontSize: 13, color: "#94a3b8", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
            data-testid="cliff-read"
          >
            {running
              ? "Running…"
              : cliff != null
                ? `≈${Math.round(cliff / 1000) * 1000} context tokens`
                : points.length > 0
                  ? `Accuracy maintained up to ≈${Math.round(maintainedTo / 1000) * 1000} tokens`
                  : "Idle"}
          </div>
        </div>
      </div>

      {/* ── Sliders ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          padding: "14px 20px",
          gap: 16,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Max Tokens */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              color: "#64748b",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              whiteSpace: "nowrap",
              minWidth: 70,
            }}
          >
            Max Tokens
          </span>
          <input
            type="range"
            min={4096}
            max={sliderMax}
            step={1024}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            data-testid="cliff-max-tokens"
            title={dims?.context_length ? `Capped at model context window (${dims.context_length})` : "Model context window unknown — fixed ceiling"}
            style={sliderStyle}
          />
          <span
            style={{
              fontSize: 12,
              color: "#e2e8f0",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "2px 8px",
              minWidth: 48,
              textAlign: "center",
            }}
          >
            {maxTokens}
          </span>
        </div>

        {/* Test Steps */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              color: "#64748b",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              whiteSpace: "nowrap",
              minWidth: 66,
            }}
          >
            Test Steps
          </span>
          <input
            type="range"
            min={2}
            max={10}
            step={1}
            value={testSteps}
            onChange={(e) => setTestSteps(Number(e.target.value))}
            style={sliderStyle}
          />
          <span
            style={{
              fontSize: 12,
              color: "#e2e8f0",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              padding: "2px 8px",
              minWidth: 32,
              textAlign: "center",
            }}
          >
            {testSteps}
          </span>
        </div>
      </div>

      {/* ── Execute Button ── */}
      <div style={{ padding: "14px 20px" }}>
        {/* Model selector shown here if not selected above */}
        {selected && (
          <div style={{ marginBottom: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
              Model:
            </span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              data-testid="cliff-model-select"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#94a3b8",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 12,
                fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="">Select a model…</option>
              {list.map((m) => (
                <option key={m.name} value={m.name}>
                  {modelLabel(m)}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          disabled={!selected || running || tasks.length === 0}
          onClick={handleRun}
          data-testid="cliff-run"
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            background:
              !selected || running || tasks.length === 0
                ? "rgba(255,255,255,0.06)"
                : "linear-gradient(135deg, #1e3a5f 0%, #1e40af 50%, #1d4ed8 100%)",
            color:
              !selected || running || tasks.length === 0 ? "rgba(148,163,184,0.5)" : "#e0e7ff",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            letterSpacing: "0.02em",
            cursor: !selected || running || tasks.length === 0 ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            boxShadow:
              !selected || running || tasks.length === 0
                ? "none"
                : "0 4px 16px rgba(29,78,216,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
          onMouseEnter={(e) => {
            if (!(!selected || running || tasks.length === 0)) {
              e.currentTarget.style.boxShadow =
                "0 6px 24px rgba(29,78,216,0.5), inset 0 1px 0 rgba(255,255,255,0.15)";
            }
          }}
          onMouseLeave={(e) => {
            if (!(!selected || running || tasks.length === 0)) {
              e.currentTarget.style.boxShadow =
                "0 4px 16px rgba(29,78,216,0.3), inset 0 1px 0 rgba(255,255,255,0.1)";
            }
          }}
        >
          {running ? "Probing…" : "Execute Probe"}
        </button>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#94a3b8",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};

const passChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "rgba(34,197,94,0.15)",
  border: "1px solid rgba(34,197,94,0.25)",
  color: "#4ade80",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
};

const failChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "rgba(234,179,8,0.12)",
  border: "1px solid rgba(234,179,8,0.25)",
  color: "#facc15",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  accentColor: "#3b82f6",
  cursor: "pointer",
  height: 4,
};
