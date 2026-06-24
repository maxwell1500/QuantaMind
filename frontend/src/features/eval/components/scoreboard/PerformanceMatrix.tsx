import { useEffect, useState } from "react";
import { useBatchStore } from "../../state/batchStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useNavStore } from "../../../../shared/state/navStore";
import { useCliffStore } from "../../state/cliffStore";
import { toScoreRows } from "./scoreRows";
import { InfoButton } from "../../../../shared/ui/InfoButton";
import { Tooltip } from "../../../../shared/ui/Tooltip";
import { TOOL_HELP, metricTitle } from "../../help";
import type { FailureTracker } from "../../../../shared/ipc/eval/batch";

/// A sensible top-of-ladder default for the probe pre-fill — the Audit panel clamps
/// it to the model's real context window.
const PREFILL_MAX_TOKENS = 16384;
/// Default ladder depth (Test Steps) carried into the pre-fill — the panel's own default.
const PREFILL_STEPS = 5;

/// Native title= tooltip for each metric column header (Model/Quant get none).
const COLUMN_HELP: Record<string, string | undefined> = {
  "Pass^k": metricTitle("passK"),
  "Native FC": "Pass^k measured via the model's NATIVE tool_calls API (Ollama /api/chat), not the prompt-based proxy. N/A when not measured / unsupported.",
  "Avg Steps": metricTitle("avgSteps"),
  Effort: metricTitle("effort"),
  "Schema Resil.": metricTitle("schemaResil"),
  "Cliff Depth": metricTitle("cliffDepth"),
  "Top Error": metricTitle("topError"),
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
  fontFamily: "Inter, sans-serif",
};

function getPassKBadge(val: string) {
  if (val === "Error") {
    return <span style={{ ...badgeStyle, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>Error</span>;
  }
  if (val === "—" || val === "N/A") {
    return <span style={{ color: "#94a3b8" }}>—</span>;
  }
  
  const isPerfect = val.includes("/") 
    ? val.split("/")[0] === val.split("/")[1]
    : val === "100%";
    
  if (isPerfect) {
    return <span style={{ ...badgeStyle, background: "#dcfce7", border: "1px solid #bbf7d0", color: "#166534" }}>{val}</span>;
  }
  
  return <span style={{ ...badgeStyle, background: "#fffbeb", border: "1px solid #fef3c7", color: "#b45309" }}>{val}</span>;
}

function getSchemaResilBadge(val: string) {
  if (val === "—") {
    return <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span>;
  }
  if (val === "N/A") {
    return <span style={{ color: "#94a3b8" }}>N/A</span>;
  }
  if (val === "100%") {
    return <span style={{ ...badgeStyle, background: "#dcfce7", border: "1px solid #bbf7d0", color: "#166534" }}>{val}</span>;
  }
  if (val === "0%") {
    return <span style={{ ...badgeStyle, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>{val}</span>;
  }
  return <span style={{ ...badgeStyle, background: "#fffbeb", border: "1px solid #fef3c7", color: "#b45309" }}>{val}</span>;
}

function getTopErrorBadge(val: string) {
  if (val === "None") {
    return <span style={{ ...badgeStyle, background: "#dcfce7", border: "1px solid #bbf7d0", color: "#166534" }}>None</span>;
  }
  if (val === "Loop Cap") {
    return <span style={{ ...badgeStyle, background: "#fffbeb", border: "1px solid #fef3c7", color: "#b45309" }}>Loop Cap</span>;
  }
  if (val === "Fake Done") {
    return <span style={{ ...badgeStyle, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>Fake Done</span>;
  }
  if (val === "Bad Schema") {
    return <span style={{ ...badgeStyle, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>Bad Schema</span>;
  }
  if (val === "Error") {
    return <span style={{ ...badgeStyle, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>Error</span>;
  }
  if (val === "Bad Dialect") {
    // Amber, not red: an unparseable foreign tool dialect is a template/build artifact, not
    // a hard capability failure — visually distinct from Fake Done / Bad Schema.
    return <span style={{ ...badgeStyle, background: "#fffbeb", border: "1px solid #fef3c7", color: "#b45309" }}>Bad Dialect</span>;
  }
  if (val === "—" || val === "N/A") {
    return <span style={{ color: "#94a3b8" }}>—</span>;
  }
  return <span style={{ ...badgeStyle, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#475569" }}>{val}</span>;
}

/// The full failure breakdown behind `top_error` — every TERMINAL failure count, so the ⓘ
/// total can never disagree with a `top_error` badge (e.g. a Bad-Dialect-only model used to
/// show the badge but `total === 0`, hiding the ⓘ). The four original modes are always shown;
/// the newer terminal modes (Forbidden / Timeout / Wrong Channel / Bad Dialect) are appended
/// only when non-zero to keep the tooltip terse. `unknown_tool_calls` is a diagnostic, not a
/// terminal failure — excluded here, mirroring the backend `top()`. Labels mirror
/// TOP_ERROR_LABEL.
function failureBreakdown(f: FailureTracker): { total: number; text: string } {
  const extra: [string, number][] = [
    ["Forbidden", f.forbidden_calls ?? 0],
    ["Timeout", f.turn_timeouts ?? 0],
    ["Wrong Channel", f.reported_in_prose_calls ?? 0],
    ["Bad Dialect", f.foreign_dialect_calls ?? 0],
  ];
  const total =
    f.infinite_loop_hits +
    f.hallucinated_completions +
    f.schema_unrecovered_calls +
    f.malformed_json_calls +
    extra.reduce((s, [, n]) => s + n, 0);
  const extraText = extra
    .filter(([, n]) => n > 0)
    .map(([l, n]) => ` · ${l} ${n}`)
    .join("");
  const text =
    `Loop Cap ${f.infinite_loop_hits} · Fake Done ${f.hallucinated_completions} · ` +
    `Bad Schema ${f.schema_unrecovered_calls} · Malformed ${f.malformed_json_calls}` +
    extraText +
    ` — Top Error is the dominant mode`;
  return { total, text };
}

export function PerformanceMatrix({
  focusedModel,
  onFocusModel,
}: {
  focusedModel: string;
  onFocusModel: (m: string) => void;
}) {
  const report = useBatchStore((s) => s.report);
  const models = useInstalledModelsStore((s) => s.list);
  const goAudit = useNavStore((s) => s.setTopView);
  const rows = toScoreRows(report, models);

  // Measured cliff depths come from the backend store (per the report's collection),
  // hydrated on mount — not browser localStorage.
  const collectionId = report?.collection_id;
  const cliffResults = useCliffStore((s) => (collectionId ? s.results[collectionId] : undefined));
  const cliffProbed = useCliffStore((s) => (collectionId ? s.probed[collectionId] : undefined));
  const cliffBroken = useCliffStore((s) => (collectionId ? s.brokenBaseline[collectionId] : undefined));
  const cliffRunning = useCliffStore((s) => s.running);
  const cliffRunningModel = useCliffStore((s) => s.runningModel);
  const setCliffRequest = useCliffStore((s) => s.setRequest);
  const hydrateCliff = useCliffStore((s) => s.hydrate);
  useEffect(() => {
    if (collectionId) void hydrateCliff(collectionId);
  }, [collectionId, hydrateCliff]);
  const anyNative = (report?.columns ?? []).some((c) => c.agentic_native_fc != null);
  const [showNative, setShowNative] = useState(false);

  // Pre-fill the Context-Cliff probe for a model + the current collection and switch to
  // the Audit tab. NEVER auto-runs (guardrail 1). Shared by the unprobed "Run probe ↗"
  // button and the "↻" re-probe affordance on already-measured cells.
  const reprobe = (model: string) => {
    const backend = report?.columns.find((c) => c.model === model)?.backend ?? "ollama";
    if (collectionId) setCliffRequest({ model, backend, collectionId, maxTokens: PREFILL_MAX_TOKENS, steps: PREFILL_STEPS });
    goAudit("audit");
  };
  // A small re-probe control shown next to a measured cliff badge — the path to Audit
  // that measured cells otherwise lacked. `stopPropagation` so it doesn't trigger the
  // row's focus/scroll.
  const ReprobeBtn = ({ model }: { model: string }) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        reprobe(model);
      }}
      title="Re-run the Context-Cliff probe for this model (opens the Audit tab)"
      data-testid={`cliff-reprobe-${model}`}
      style={{ marginLeft: 4, cursor: "pointer", color: "#94a3b8", fontSize: 11, background: "none", border: "none", padding: 0 }}
    >
      ↻
    </button>
  );
  const columns = [
    "Model",
    "Quant",
    "Pass^k",
    ...(showNative ? ["Native FC"] : []),
    "Avg Steps",
    "Effort",
    "Schema Resil.",
    "Cliff Depth",
    "Top Error",
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden border border-slate-200 transition-all duration-300 shadow-sm"
      style={panel}
      data-testid="performance-matrix"
    >
      <div style={header}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="flex h-2 w-2 rounded-full bg-blue-500" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "Inter, sans-serif", letterSpacing: "0.03em" }}>
            4. LLM PERFORMANCE MATRIX
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter, sans-serif" }}>
          {/* The "click to inspect" hint only earns its place with ≥2 models to switch
              between; with one model the row click just scrolls to the (already-shown) detail. */}
          {rows.length > 1 ? " (per-model summary — click a row to inspect model details)" : " (per-model summary)"}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10 }}>
          {rows.length > 0 && (
            <button
              type="button"
              data-testid="matrix-native-toggle"
              onClick={() => setShowNative((v) => !v)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 6,
                border: "1px solid #bfdbfe",
                background: showNative ? "#eff6ff" : "transparent",
                color: "#2563eb",
                cursor: "pointer",
              }}
            >
              {showNative ? "Hide" : "Show"} Native-FC
            </button>
          )}
          <InfoButton {...TOOL_HELP.performanceMatrix} testId="performance-matrix" />
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "24px 20px", color: "#64748b", fontSize: 13, fontFamily: "Inter, sans-serif", textAlign: "center" }}>
          Pick one or more target models and Run Batch to compare them here.
        </div>
      ) : (
        <>
        {showNative && !anyNative && (
          <div
            data-testid="native-fc-empty-hint"
            style={{ margin: "0 16px 10px", padding: "8px 12px", fontSize: 12, lineHeight: 1.5, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontFamily: "Inter, sans-serif" }}
          >
            No model here exposes native tool-calling, so the column is all N/A. It's measured only
            for <strong>Ollama</strong> models whose chat template advertises tool support — many
            fine-tuned or heavily-quantized models (and all llama.cpp / MLX models) don't, so they stay
            N/A even with <strong>"Measure native tool-calling (Ollama)"</strong> enabled. If you
            haven't turned that on in the run config yet, do so and re-run.
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="performance-matrix-table">
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                {columns.map((h) => {
                  const tip = COLUMN_HELP[h];
                  return (
                    <th key={h} style={th}>
                      {tip ? <Tooltip label={tip} testId={`col-${h}`}><span style={{ cursor: "help" }}>{h}</span></Tooltip> : h}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const active = r.model === focusedModel;
                return (
                  <tr
                    key={r.model}
                    onClick={() => onFocusModel(r.model)}
                    data-testid={`matrix-model-row-${r.model}`}
                    className="hover:bg-slate-50 transition-all duration-150 relative"
                    style={{
                      cursor: "pointer",
                      background: active ? "#eff6ff" : "transparent",
                      borderBottom: "1px solid #e2e8f0",
                      borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
                    }}
                    title="Click to inspect this model above"
                  >
                    <td style={{ ...td, color: active ? "#1d4ed8" : "#0f172a", fontWeight: active ? 700 : 500 }}>{r.label}</td>
                    <td style={{ ...td, color: "#64748b", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{r.quant}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{getPassKBadge(r.passK)}</td>
                    {showNative && (
                      <td
                        style={{ ...td, fontWeight: 700 }}
                        data-testid={`matrix-native-${r.model}`}
                        // Explain an N/A rather than leave a silent wall. The reason is the
                        // model, not the toggle: native FC needs an Ollama model whose
                        // /api/show lists the `tools` capability (gemma/most fine-tuned &
                        // quantized models don't); llama.cpp / MLX are always N/A.
                        title={
                          r.passKNative === "N/A"
                            ? "Native tool-calling is N/A for this model — it's measured only for Ollama models whose /api/show lists the `tools` capability (gemma & many fine-tuned / quantized models don't); llama.cpp / MLX are always N/A."
                            : undefined
                        }
                      >
                        {getPassKBadge(r.passKNative)}
                      </td>
                    )}
                    <td style={{ ...td, color: r.avgSteps === "—" ? "#94a3b8" : "#334155" }}>{r.avgSteps}</td>
                    <td style={{ ...td, color: r.effort === "—" ? "#94a3b8" : "#334155", fontFamily: r.effort !== "—" ? "'JetBrains Mono', monospace" : "inherit", fontSize: 12 }}>{r.effort}</td>
                    <td style={td}>{getSchemaResilBadge(r.schemaResil)}</td>
                    <td style={td}>
                      {cliffRunning && cliffRunningModel === r.model ? (
                        <span data-testid={`cliff-probing-${r.model}`} style={{ color: "#2563eb", fontSize: 12, fontWeight: 600, fontFamily: "Inter, sans-serif" }}>
                          probing…
                        </span>
                      ) : cliffBroken?.[r.model] ? (
                        // Checked BEFORE a persisted depth: a broken baseline failed at the
                        // SMALLEST context (no healthy plateau to fall off). Even though the
                        // backend persists it as a collapse depth (for the Agent Report gate),
                        // the Matrix must show the red failure, never dress it up as a cliff.
                        <>
                          <span
                            style={{ ...badgeStyle, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b", textTransform: "none" }}
                            data-testid={`cliff-broken-${r.model}`}
                            title="Probed — accuracy was already failing at the smallest context (broken baseline), so no usable context window could be measured. This is a tool-call failure, not a context-length limit."
                          >
                            fails from start
                          </span>
                          <ReprobeBtn model={r.model} />
                        </>
                      ) : cliffResults?.[r.model] != null ? (
                        <>
                          <span style={{ ...badgeStyle, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#334155", textTransform: "none" }} data-testid={`cliff-value-${r.model}`}>
                            {cliffResults[r.model].toLocaleString()} tok
                          </span>
                          <ReprobeBtn model={r.model} />
                        </>
                      ) : cliffProbed?.[r.model] ? (
                        // Probed this session, accuracy held across the range from a HEALTHY
                        // baseline — a genuinely GOOD result, not just "no drop from zero".
                        <>
                          <span
                            style={{ ...badgeStyle, background: "#dcfce7", border: "1px solid #bbf7d0", color: "#166534", textTransform: "none" }}
                            data-testid={`cliff-nocliff-${r.model}`}
                            title="Probed — accuracy held across the tested context range (no cliff found)"
                          >
                            ✓ no cliff
                          </span>
                          <ReprobeBtn model={r.model} />
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            reprobe(r.model);
                          }}
                          title="Not measured yet — pre-fills the Context-Cliff probe for this model on the Audit tab"
                          style={cliffLink}
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 border border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-300 transition-all cursor-pointer inline-flex items-center gap-1"
                          data-testid={`cliff-run-${r.model}`}
                        >
                          Run probe ↗
                        </button>
                      )}
                    </td>
                    <td style={td}>
                      {getTopErrorBadge(r.topError)}
                      {(() => {
                        // Clip-safe portal tooltip — the table card scrolls
                        // (overflow), which would clip an in-flow popup, and the
                        // native title= the cell used before doesn't render
                        // reliably in the WebView. Tooltip portals to <body>.
                        if (!r.failures) return null;
                        const fb = failureBreakdown(r.failures);
                        if (fb.total === 0) return null;
                        return (
                          <Tooltip label={fb.text} testId={`failbreak-${r.model}`}>
                            <span
                              data-testid={`failbreak-${r.model}`}
                              style={{ marginLeft: 5, cursor: "help", color: "#94a3b8", fontSize: 10, fontWeight: 700 }}
                            >
                              ⓘ
                            </span>
                          </Tooltip>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      {rows.length > 0 && (
        <div style={legendStyle} data-testid="matrix-legend">
          <strong style={{ color: "#475569" }}>Cliff Depth</strong> — the context length where a model's
          tool-call accuracy starts to collapse. Click <strong style={{ color: "#2563eb" }}>Run probe ↗</strong> to
          measure it (runs in the Audit tab); the result feeds the model's Agent-Readiness verdict.{" "}
          <span style={{ color: "#166534", fontWeight: 600 }}>✓ no cliff</span> = probed, accuracy held the whole range from a healthy baseline.{" "}
          <span style={{ color: "#991b1b", fontWeight: 600 }}>fails from start</span> = already failing at the smallest context (a tool-call failure, not a context limit).
        </div>
      )}
    </div>
  );
}

const legendStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderTop: "1px solid #f1f5f9",
  fontSize: 11,
  lineHeight: 1.5,
  color: "#64748b",
  fontFamily: "Inter, sans-serif",
};

const panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
};
const header: React.CSSProperties = {
  padding: "14px 20px",
  borderBottom: "1px solid #e2e8f0",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  background: "#fafafa",
};
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 10,
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  padding: "10px 14px",
  fontFamily: "Inter, sans-serif",
};
const td: React.CSSProperties = {
  fontSize: 13,
  color: "#334155",
  padding: "10px 14px",
  fontFamily: "Inter, sans-serif",
};
const cliffLink: React.CSSProperties = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 0,
};
