import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEvalRegistryStore } from "../../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useSelectedModelStore } from "../../../../shared/state/selectedModelStore";
import { InfoButton } from "../../../../shared/ui/InfoButton";
import { TOOL_HELP } from "../../help";
import { useBatchStore } from "../../state/batchStore";
import { useBatchRun } from "../../hooks/useBatchRun";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { useToast } from "../../../../shared/ui/Toast";
import type { ToolTask } from "../../../../shared/ipc/eval/registry";
import { batchToCsv, download } from "../../exportBatch";
import { ConfirmDialog } from "./ConfirmDialog";
import { CsvImportModal } from "./CsvImportModal";
import { KebabMenu } from "./KebabMenu";
import { Spinner } from "../../../../shared/ui/Spinner";

interface EvalManagerProps {
  model: string;
  setModel: (m: string) => void;
  k: number;
  setK: (k: number) => void;
  maxSteps: number;
  setMaxSteps: (steps: number) => void;
  onNewCollection: () => void;
  onEditCollection: () => void;
}

export function EvalManager({
  model = "",
  setModel = () => {},
  k = 1,
  setK = () => {},
  maxSteps = 8,
  setMaxSteps = () => {},
  onNewCollection = () => {},
  onEditCollection = () => {},
}: Partial<EvalManagerProps> = {}) {
  const { presets, collections, selected, tasks, init, select, isPreset, importFile, save, remove, hidePreset } =
    useEvalRegistryStore();
  const showToast = useToast();
  const list = useInstalledModelsStore((s) => s.list);
  // The eval runs ONE model from the GLOBAL selection (single source of truth) — the
  // header's multi (Ollama) / single (llama.cpp/MLX) picker. No per-page model list.
  const selectedModels = useSelectedModelStore((s) => s.selectedModels);
  const running = useBatchStore((s) => s.running);
  const report = useBatchStore((s) => s.report);
  const { run, stop } = useBatchRun();

  const [collectionsExpanded, setCollectionsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  // Phase 7.2: also measure each Ollama model's NATIVE tool-calling path.
  const [nativeFc, setNativeFc] = useState(false);

  const handleCsvImport = async (name: string, csvTasks: ToolTask[]) => {
    await save(name, csvTasks);
    showToast(`CSV imported: ${csvTasks.length} task${csvTasks.length > 1 ? "s" : ""} ✓`);
  };

  // Determine dataSource based on the active selection
  const dataSource = isPreset(selected) ? "builtin" : "custom";

  // Init on mount.
  useEffect(() => {
    void init().catch((e) => console.error("eval registry init failed (EvalManager):", e));
  }, [init]);

  const handleDataSourceChange = async (source: "custom" | "builtin") => {
    setError(null);
    try {
      if (source === "builtin") {
        if (presets.length > 0) {
          await select(presets[0].id);
        }
      } else {
        if (collections.length > 0) {
          await select(collections[0]);
        } else {
          // If no custom collections exist, select empty or keep selection
        }
      }
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const handleImport = async () => {
    setError(null);
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof picked === "string") {
        await importFile(picked);
      }
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const handleExport = () => {
    if (report) {
      download("audit-trail.csv", batchToCsv(report, list), "text/csv");
    }
  };

  const confirmDeleteCollection = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setError(null);
    try {
      // Presets live in the bundle and can't be deleted from disk — hide them
      // from the list instead; custom collections are removed for real.
      if (isPreset(target)) hidePreset(target);
      else await remove(target);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const handleRunBatch = async () => {
    setError(null);
    if (running) {
      await stop();
      return;
    }
    const picked = selectedModels.find((m) => m.name === model);
    if (!picked || tasks.length === 0) return;
    void run(selected, [{ model: picked.name, backend: picked.backend }], tasks, k, maxSteps, nativeFc);
  };

  const runDisabled = !model || tasks.length === 0;
  // Explain WHY RUN BATCH is disabled instead of leaving a greyed-out dead button.
  const runDisabledReason =
    !model && tasks.length === 0
      ? "Select a model at the top and a collection with tasks"
      : !model
        ? "Select a model at the top"
        : tasks.length === 0
          ? "This collection has no tasks"
          : undefined;

  return (
    <div
      className="rounded-xl overflow-hidden border border-slate-200"
      style={panelStyle}
      data-testid="eval-manager"
    >
      {/* Title Header */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", fontFamily: "Inter, sans-serif" }}>
            1. EVAL MANAGER
          </div>
          <span style={{ marginLeft: "auto" }}>
            <InfoButton {...TOOL_HELP.evalManager} testId="eval-manager" />
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#64748b", fontFamily: "Inter, sans-serif", marginTop: 2 }}>
          (File & Controls)
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 16px" }}>
          <p style={errorTextStyle}>{error}</p>
        </div>
      )}

      {/* Sidebar Controls Body */}
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 24, flex: 1, overflowY: "auto" }}>
        
        {/* DATA SOURCE Section */}
        <div>
          <div style={sectionHeaderStyle}>▾ DATA SOURCE</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 12, marginTop: 8 }}>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="dataSource"
                checked={dataSource === "custom"}
                onChange={() => void handleDataSourceChange("custom")}
                style={radioInputStyle}
              />
              <span style={{ fontSize: 13, color: dataSource === "custom" ? "#0f172a" : "#64748b" }}>
                {dataSource === "custom" ? "◉" : "◯"} Custom JSON
              </span>
            </label>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="dataSource"
                checked={dataSource === "builtin"}
                onChange={() => void handleDataSourceChange("builtin")}
                style={radioInputStyle}
              />
              <span style={{ fontSize: 13, color: dataSource === "builtin" ? "#0f172a" : "#64748b" }}>
                {dataSource === "builtin" ? "◉" : "◯"} Built-in
              </span>
            </label>
          </div>
        </div>

        {/* COLLECTIONS Section */}
        <div>
          <div
            style={{ ...sectionHeaderStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setCollectionsExpanded(!collectionsExpanded)}
          >
            <span>{collectionsExpanded ? "▾" : "▸"}</span>
            <span>COLLECTIONS</span>
          </div>
          {collectionsExpanded && (
            <div style={{ paddingLeft: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Collection list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {dataSource === "custom" ? (
                  collections.length === 0 ? (
                    <div style={{ color: "#64748b", fontSize: 12, fontStyle: "italic", paddingLeft: 8 }}>
                      No custom JSONs
                    </div>
                  ) : (
                    collections.map((c) => (
                      <div
                        key={c}
                        style={{
                          ...collectionItemStyle,
                          justifyContent: "space-between",
                          color: selected === c ? "#2563eb" : "#475569",
                          fontWeight: selected === c ? 600 : 400,
                        }}
                      >
                        <span
                          onClick={() => void select(c)}
                          style={{ display: "flex", alignItems: "center", cursor: "pointer", flex: 1, minWidth: 0 }}
                          data-testid={`eval-collection-item-${c}`}
                        >
                          <span style={{ marginRight: 6 }}>{selected === c ? "•" : "-"}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                        </span>
                        <KebabMenu
                          testid={`eval-collection-menu-${c}`}
                          items={[{ label: "Delete collection", danger: true, onClick: () => setDeleteTarget(c), testid: `eval-collection-delete-${c}` }]}
                        />
                      </div>
                    ))
                  )
                ) : (
                  // Built-in collections grouped by difficulty tier (Easy→Extreme).
                  (["easy", "medium", "hard", "extreme"] as const).map((tier) => {
                    const items = presets.filter((p) => p.tier === tier);
                    if (items.length === 0) return null;
                    return (
                      <div key={tier} data-testid={`eval-tier-group-${tier}`}>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", padding: "10px 0 2px" }}>
                          {tier}
                        </div>
                        {items.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              ...collectionItemStyle,
                              justifyContent: "space-between",
                              color: selected === p.id ? "#2563eb" : "#475569",
                              fontWeight: selected === p.id ? 600 : 400,
                            }}
                          >
                            <span
                              onClick={() => void select(p.id)}
                              style={{ display: "flex", alignItems: "center", cursor: "pointer", flex: 1, minWidth: 0 }}
                              data-testid={`eval-collection-item-${p.id}`}
                            >
                              <span style={{ marginRight: 6 }}>{selected === p.id ? "•" : "-"}</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
                            </span>
                            <KebabMenu
                              testid={`eval-collection-menu-${p.id}`}
                              items={[{ label: "Remove from list", danger: true, onClick: () => setDeleteTarget(p.id), testid: `eval-collection-delete-${p.id}` }]}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {/* Authoring actions */}
          <div style={{ display: "flex", gap: 8, paddingLeft: 12, marginTop: 10 }}>
            <button type="button" onClick={onNewCollection} style={actionBtnStyle} data-testid="eval-new-collection">
              + New Collection
            </button>
            <button type="button" onClick={onEditCollection} style={actionBtnStyle} data-testid="eval-edit-collection">
              ✎ Edit
            </button>
          </div>
        </div>

        {/* RUN CONTROLS Section */}
        <div>
          <div style={sectionHeaderStyle}>▾ RUN CONTROLS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingLeft: 12, marginTop: 10 }}>
            
            {/* Model — the one to eval, from the GLOBAL selection (pick at the top). */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-testid="eval-manager-model-select">
              <span style={controlLabelStyle}>Model:</span>
              {selectedModels.length === 0 ? (
                <span style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }} data-testid="eval-no-model">
                  Select a model at the top
                </span>
              ) : (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  data-testid="eval-model-dropdown"
                  style={{ ...numberInputStyle, width: "100%", cursor: "pointer" }}
                >
                  {selectedModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Iterations Selector — Pass^k repeats; only affects Multi-Step tasks */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ ...controlLabelStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
                Iterations (k):
                <InfoButton {...TOOL_HELP.iterations} align="left" testId="iterations" />
              </span>
              <input
                type="number"
                min={1}
                value={k}
                onChange={(e) => setK(Math.max(1, +e.target.value))}
                style={numberInputStyle}
                data-testid="eval-manager-k"
              />
            </div>

            {/* Max Steps — agentic loop cap; only affects Multi-Step tasks */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={controlLabelStyle} title="Max turns an agentic task may take before it's marked a loop-cap failure. No effect on single-turn tasks.">
                Max Steps:
              </span>
              <input
                type="number"
                min={1}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Math.max(1, +e.target.value))}
                style={numberInputStyle}
                data-testid="eval-manager-max-steps"
              />
            </div>

            {/* Native function-calling (Phase 7.2) — measure the Ollama tool_calls
                path alongside the prompt-based proxy. */}
            <label
              style={{ ...controlLabelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              title="Also run each Ollama model through its native /api/chat tool_calls API and compare. llama.cpp / MLX show N/A."
            >
              <input
                type="checkbox"
                checked={nativeFc}
                onChange={(e) => setNativeFc(e.target.checked)}
                data-testid="eval-native-fc"
              />
              Measure native tool-calling (Ollama)
            </label>

            {/* Honesty nudge: when the native path is OFF, the batch is the
                prompt-based proxy — a tool-tuned model that answers in prose is
                scored Fail though its native API would pass. Point the blame at the
                model's architecture + teach the toggle, so the gap isn't read as a
                tool bug. Hidden once native is on (they've already opted in). */}
            {!nativeFc && (
              <div
                data-testid="native-fc-hint"
                style={{
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: "#64748b",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "7px 9px",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                Prompt-based results may underrepresent native tool-calling capability. Enable{" "}
                <strong style={{ color: "#475569" }}>Measure native tool-calling</strong> for strict API fidelity.
              </div>
            )}

            {/* RUN BATCH Button */}
            <button
              type="button"
              onClick={() => void handleRunBatch()}
              disabled={runDisabled}
              title={running ? undefined : runDisabledReason}
              style={{
                ...runBatchBtnStyle,
                background: running
                  ? "#fee2e2"
                  : runDisabled
                    ? "#f1f5f9"
                    : "#dcfce7",
                color: running
                  ? "#991b1b"
                  : runDisabled
                    ? "#94a3b8"
                    : "#166534",
                borderColor: running
                  ? "#fca5a5"
                  : runDisabled
                    ? "#e2e8f0"
                    : "#bbf7d0",
                cursor: runDisabled ? "not-allowed" : "pointer",
              }}
              data-testid="eval-run-all"
            >
              {running ? (
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Spinner color="#991b1b" /> ■ STOP BATCH
                </span>
              ) : (
                "▶ RUN BATCH"
              )}
            </button>
            {running && (
              <div style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter, sans-serif", textAlign: "center", marginTop: -6 }}>
                Evaluating… click to cancel.
              </div>
            )}

            {/* Import & Export Links */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void handleImport()}
                style={actionBtnStyle}
                data-testid="eval-manager-import"
              >
                [↓] Import .json
              </button>
              <button
                type="button"
                onClick={() => setCsvOpen(true)}
                style={actionBtnStyle}
                data-testid="eval-manager-import-csv"
              >
                [↓] Import CSV
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={!report}
                style={{
                  ...actionBtnStyle,
                  opacity: report ? 1 : 0.4,
                  cursor: report ? "pointer" : "not-allowed",
                }}
                data-testid="export-csv"
              >
                [↓] Export Results
              </button>
            </div>

          </div>
        </div>

      </div>

      {deleteTarget && (
        <ConfirmDialog
          title={isPreset(deleteTarget) ? "Remove preset" : "Delete collection"}
          message={
            isPreset(deleteTarget)
              ? `Remove the built-in preset “${deleteTarget}” from the list? (It’s bundled, so you can get it back later.)`
              : `Delete the collection “${deleteTarget}”? This cannot be undone.`
          }
          confirmLabel={isPreset(deleteTarget) ? "Remove" : "Delete"}
          onConfirm={() => void confirmDeleteCollection()}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {csvOpen && <CsvImportModal onImport={handleCsvImport} onClose={() => setCsvOpen(false)} />}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
  display: "flex",
  flexDirection: "column",
  minHeight: 520,
};

const headerStyle: React.CSSProperties = {
  padding: "16px 20px 14px",
  borderBottom: "1px solid #e2e8f0",
  background: "#fafafa",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "#64748b",
  letterSpacing: "0.06em",
  fontFamily: "Inter, sans-serif",
  userSelect: "none",
};

const radioLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};

const radioInputStyle: React.CSSProperties = {
  display: "none", // Hide actual radio; we use custom characters/styling
};

const collectionItemStyle: React.CSSProperties = {
  fontSize: 13,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  transition: "color 0.15s ease",
  padding: "2px 0",
};

const controlLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#475569",
  fontFamily: "Inter, sans-serif",
};


const numberInputStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  color: "#0f172a",
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  padding: "4px 8px",
  outline: "none",
  width: 55,
  textAlign: "center",
};

const runBatchBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 0",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "Inter, sans-serif",
  borderWidth: 1,
  borderStyle: "solid",
  transition: "all 0.15s ease",
  textAlign: "center",
  letterSpacing: "0.02em",
};

const actionBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#2563eb",
  fontSize: 13,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer",
  textAlign: "left",
  padding: "2px 0",
  width: "fit-content",
  transition: "opacity 0.15s ease",
};

const errorTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#b91c1c",
  fontFamily: "Inter, sans-serif",
  background: "#fef2f2",
  border: "1px solid #fee2e2",
  borderRadius: 5,
  padding: "5px 10px",
  margin: 0,
};
