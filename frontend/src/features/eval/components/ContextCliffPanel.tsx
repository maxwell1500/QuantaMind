import { useEffect, useState } from "react";
import { modelLabel } from "../../../shared/models/modelLabel";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { useParamsStore } from "../../../shared/state/paramsStore";
import { useEvalRegistryStore, DEFAULT_PRESET } from "../state/evalRegistryStore";
import { getBuiltinCollection, loadCustomCollection, type ToolTask } from "../../../shared/ipc/eval/registry";
import { useVramFit } from "../../quant/useVramFit";
import { useCliffStore } from "../state/cliffStore";
import { InfoButton } from "../../../shared/ui/InfoButton";
import { TOOL_HELP } from "../help";
import { cliffPoint } from "../cliff";
import { ContextCliffChart } from "./ContextCliffChart";
import type { BackendKind } from "../../../shared/ipc/models/storage";

interface ProbeModel {
  name: string;
  backend: BackendKind;
}

const FALLBACK_MAX_TOKENS = 65536; // slider ceiling when the model context window is unknown

/// Context-Cliff probe: runs a chosen dataset at growing prompt lengths and
/// graphs where tool-call accuracy collapses. Frontend-only, padding is
/// approximate (≈tokens) — labelled indicative, not a tokenizer. Owns its own
/// collection selection so it never depends on the EvalManager editor.
export function ContextCliffPanel() {
  const { presets, collections, init } = useEvalRegistryStore();
  const [active, setActive] = useState(DEFAULT_PRESET);
  const [tasks, setTasks] = useState<ToolTask[]>([]);
  const [maxTokens, setMaxTokens] = useState(16384);
  const [testSteps, setTestSteps] = useState(5);
  // The probe runs ONE of the global header models + global params. With 2+
  // selected (Ollama), a small dropdown picks which one; default the first. A
  // pre-fill request from the Matrix can OVERRIDE that with any batch-target model.
  const selectedModels = useSelectedModelStore((s) => s.selectedModels);
  const globalParams = useParamsStore((s) => s.globalParams);
  const [probeName, setProbeName] = useState("");
  const [override, setOverride] = useState<ProbeModel | null>(null);
  const selected: ProbeModel | null =
    override ?? selectedModels.find((m) => m.name === probeName) ?? selectedModels[0] ?? null;
  const model = selected?.name ?? "";
  // Header models, plus the Matrix-pre-filled override when it isn't one of them.
  const modelOptions: ProbeModel[] =
    override && !selectedModels.some((m) => m.name === override.name) ? [override, ...selectedModels] : selectedModels;

  // Keep the probe model inside the current selection (e.g. after a backend switch),
  // unless an explicit Matrix pre-fill override is in effect.
  useEffect(() => {
    if (!override && probeName && !selectedModels.some((m) => m.name === probeName)) setProbeName("");
  }, [selectedModels, probeName, override]);

  // ── Cliff store: the probe run lives in the store so it survives navigation ──
  const points = useCliffStore((s) => s.points);
  const running = useCliffStore((s) => s.running);
  const error = useCliffStore((s) => s.error);
  const progress = useCliffStore((s) => s.progress);
  const runningModel = useCliffStore((s) => s.runningModel);
  const runProbe = useCliffStore((s) => s.runProbe);
  const stopProbe = useCliffStore((s) => s.stop);
  const resetProbe = useCliffStore((s) => s.reset);
  const consumeRequest = useCliffStore((s) => s.consumeRequest);

  // Consume a Matrix pre-fill ONCE on mount: pre-select model + collection + max
  // tokens, but NEVER auto-run (guardrail 1) — the user clicks Execute.
  useEffect(() => {
    const req = consumeRequest();
    if (req) {
      setOverride({ name: req.model, backend: req.backend });
      setActive(req.collectionId);
      setMaxTokens(req.maxTokens);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPreset = (id: string) => presets.some((p) => p.id === id);

  useEffect(() => {
    void init().catch((e) => console.error("eval registry init failed (ContextCliffPanel):", e));
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

  const cliff = cliffPoint(points);

  // Clear a stale chart when the selection changes (and nothing is running), so the
  // graph always reflects the currently-selected model/collection.
  useEffect(() => {
    if (!running) resetProbe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, active]);

  const maintainedTo = points.reduce(
    (mx, p) => (p.composite != null && p.promptTokens != null && p.promptTokens > mx ? p.promptTokens : mx),
    0,
  );
  const lastDepth = points.length > 0 ? points[points.length - 1].promptTokens : null;

  const handleRun = () => {
    if (!selected) return;
    void runProbe({
      model: selected.name,
      backend: selected.backend,
      collectionId: active, // scope the saved cliff per (collection, model)
      tasks,
      maxTokens,
      steps: testSteps,
      params: globalParams,
    });
  };
  const handleStop = () => stopProbe();
  const handleReset = () => resetProbe();

  return (
    <div
      className="rounded-xl overflow-hidden border border-slate-200 bg-white"
      style={{
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
      data-testid="cliff-panel"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: "#1e293b", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
          >
            Context-Cliff Diagnostic Probe
          </h2>
          <select
            value={active}
            onChange={(e) => { setActive(e.target.value); setOverride(null); resetProbe(); }}
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
        <div className="flex items-center gap-2">
          <InfoButton {...TOOL_HELP.contextCliff} testId="context-cliff" />
          <button
            type="button"
            onClick={handleReset}
            title="Reset"
            style={{
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              color: "#475569",
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
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e2e8f0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f1f5f9")}
          >
            ↺
          </button>
        </div>
      </div>

      {/* ── Error (a backend failure is shown, never a silent blank chart) ── */}
      {error && (
        <div style={{ padding: "0 20px 8px" }}>
          <p
            style={{
              fontSize: 11,
              color: "#dc2626",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              background: "rgba(220,38,38,0.05)",
              border: "1px solid rgba(220,38,38,0.15)",
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
              color: "#94a3b8",
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
                      borderBottom: "1px solid #e2e8f0",
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
                        ? "#f8fafc"
                        : "transparent",
                    }}
                  >
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={tdStyle}>
                      {p.promptTokens != null ? Math.round(p.promptTokens).toLocaleString() : "Not available"}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#1e293b" }}>{pct}</td>
                    <td style={tdStyle}>
                      {passed && (
                        <span style={passChipStyle}>
                          Pass
                        </span>
                      )}
                      {failed && (
                        <span style={failChipStyle}>
                          Failure
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
      <div style={{ height: 1, background: "#f1f5f9", margin: "0 0" }} />

      {/* ── Model & Status Row ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          padding: "14px 20px",
          borderBottom: "1px solid #f1f5f9",
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
              fontWeight: 650,
            }}
          >
            Model
          </div>
          <div data-testid="cliff-model" style={{ fontSize: 13, color: "#475569", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
            {modelOptions.length >= 2 ? (
              <select
                value={model}
                onChange={(e) => {
                  setOverride(null);
                  setProbeName(e.target.value);
                }}
                data-testid="cliff-model-select"
                style={{
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  color: "#334155",
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 12,
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {modelOptions.map((m) => (
                  <option key={m.name} value={m.name}>{modelLabel(m)}</option>
                ))}
              </select>
            ) : selected ? modelLabel(selected) : "Select a model in the header"}
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
              fontWeight: 650,
            }}
          >
            Status
          </div>
          <div
            style={{ fontSize: 13, color: "#475569", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
            data-testid="cliff-read"
          >
            {running
              ? "Running…"
              : cliff != null
                ? `≈${Math.round(cliff / 1000) * 1000} context tokens`
                : maintainedTo > 0
                  ? `Accuracy maintained up to ≈${Math.round(maintainedTo / 1000) * 1000} tokens`
                  : points.length > 0
                    ? "Ran — context-token depth not reported"
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
          borderBottom: "1px solid #f1f5f9",
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
              color: "#334155",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
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
              color: "#334155",
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
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

      {/* ── Progress + Execute / Stop ── */}
      <div style={{ padding: "14px 20px" }}>
        {running && (
          <div data-testid="cliff-progress" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#475569", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", marginBottom: 6 }}>
              Probing {runningModel ?? model} — rung {progress.done}/{progress.total}
              {lastDepth != null ? ` · ~${(lastDepth / 1000).toFixed(1)}k tokens` : ""}… keep this tab open or switch away — the run continues.
            </div>
            <div style={{ height: 5, background: "#f1f5f9", borderRadius: 3 }}>
              <div
                style={{
                  height: 5,
                  width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                  background: "#2563eb",
                  borderRadius: 3,
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          disabled={running ? false : !selected || tasks.length === 0}
          onClick={running ? handleStop : handleRun}
          data-testid="cliff-run"
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: running ? "1px solid #fca5a5" : "none",
            background: running ? "#fee2e2" : !selected || tasks.length === 0 ? "#f1f5f9" : "#0f172a",
            color: running ? "#991b1b" : !selected || tasks.length === 0 ? "#94a3b8" : "#ffffff",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            letterSpacing: "0.02em",
            cursor: running || (selected && tasks.length > 0) ? "pointer" : "not-allowed",
            transition: "all 0.2s",
          }}
        >
          {running ? "■ Stop Probe" : "Execute Probe"}
        </button>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 13,
  color: "#475569",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  borderBottom: "1px solid #f1f5f9",
};

const passChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "rgba(16,185,129,0.06)",
  border: "1px solid rgba(16,185,129,0.2)",
  color: "#059669",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 650,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
};

const failChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "rgba(220,38,38,0.05)",
  border: "1px solid rgba(220,38,38,0.2)",
  color: "#dc2626",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 650,
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  accentColor: "#2563eb",
  cursor: "pointer",
  height: 4,
};

