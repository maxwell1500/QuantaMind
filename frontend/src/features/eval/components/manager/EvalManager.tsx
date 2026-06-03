import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEvalRegistryStore } from "../../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useBatchStore } from "../../state/batchStore";
import { useBatchRun } from "../../hooks/useBatchRun";
import { modelLabel } from "../../../../shared/models/modelLabel";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { batchToCsv, download } from "../../exportBatch";

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
  const { presets, collections, selected, tasks, init, select, isPreset, importFile } =
    useEvalRegistryStore();
  const list = useInstalledModelsStore((s) => s.list);
  const running = useBatchStore((s) => s.running);
  const report = useBatchStore((s) => s.report);
  const { run, stop } = useBatchRun();

  const [collectionsExpanded, setCollectionsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine dataSource based on the active selection
  const dataSource = isPreset(selected) ? "builtin" : "custom";

  // Init on mount.
  useEffect(() => {
    void init().catch(() => {});
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

  const handleRunBatch = async () => {
    setError(null);
    if (running) {
      await stop();
    } else {
      const m = list.find((x) => x.name === model);
      if (!m || tasks.length === 0) return;
      void run(selected, [{ model: m.name, backend: m.backend }], tasks, k, maxSteps);
    }
  };

  const selectedModelInfo = list.find((m) => m.name === model);
  const runDisabled = !selectedModelInfo || tasks.length === 0;

  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10"
      style={panelStyle}
      data-testid="eval-manager"
    >
      {/* Title Header */}
      <div style={headerStyle}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
          1. EVAL MANAGER
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
              <span style={{ fontSize: 13, color: dataSource === "custom" ? "#e2e8f0" : "#94a3b8" }}>
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
              <span style={{ fontSize: 13, color: dataSource === "builtin" ? "#e2e8f0" : "#94a3b8" }}>
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
              {/* Directory Node */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13 }}>
                <span>►</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "-0.02em" }}>
                  {dataSource === "custom" ? "/local_agents/" : "/builtin_presets/"}
                </span>
              </div>
              
              {/* Children Nodes */}
              <div style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                {dataSource === "custom" ? (
                  collections.length === 0 ? (
                    <div style={{ color: "#475569", fontSize: 12, fontStyle: "italic", paddingLeft: 8 }}>
                      No custom JSONs
                    </div>
                  ) : (
                    collections.map((c) => (
                      <div
                        key={c}
                        onClick={() => void select(c)}
                        style={{
                          ...collectionItemStyle,
                          color: selected === c ? "#3b82f6" : "#94a3b8",
                          fontWeight: selected === c ? 600 : 400,
                        }}
                        data-testid={`eval-collection-item-${c}`}
                      >
                        <span style={{ marginRight: 6 }}>{selected === c ? "•" : "-"}</span>
                        <span>{c}</span>
                      </div>
                    ))
                  )
                ) : (
                  presets.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => void select(p.id)}
                      style={{
                        ...collectionItemStyle,
                        color: selected === p.id ? "#3b82f6" : "#94a3b8",
                        fontWeight: selected === p.id ? 600 : 400,
                      }}
                      data-testid={`eval-collection-item-${p.id}`}
                    >
                      <span style={{ marginRight: 6 }}>{selected === p.id ? "•" : "-"}</span>
                      <span>{p.label}</span>
                    </div>
                  ))
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
            
            {/* Target Model Selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={controlLabelStyle}>Target Model:</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={selectDropdownStyle}
                data-testid="eval-manager-model-select"
              >
                <option value="">Select model…</option>
                {list.map((m) => (
                  <option key={m.name} value={m.name}>
                    {modelLabel(m)}
                  </option>
                ))}
              </select>
            </div>

            {/* Iterations Selector */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={controlLabelStyle}>Iterations (k):</span>
              <input
                type="number"
                min={1}
                value={k}
                onChange={(e) => setK(Math.max(1, +e.target.value))}
                style={numberInputStyle}
                data-testid="eval-manager-k"
              />
            </div>

            {/* Max Steps Selector */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={controlLabelStyle}>Max Steps:</span>
              <input
                type="number"
                min={1}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Math.max(1, +e.target.value))}
                style={numberInputStyle}
                data-testid="eval-manager-max-steps"
              />
            </div>

            {/* RUN BATCH Button */}
            <button
              type="button"
              onClick={() => void handleRunBatch()}
              disabled={runDisabled}
              style={{
                ...runBatchBtnStyle,
                background: running
                  ? "rgba(239, 68, 68, 0.2)"
                  : runDisabled
                    ? "rgba(255, 255, 255, 0.03)"
                    : "rgba(34, 197, 94, 0.18)",
                color: running
                  ? "#f87171"
                  : runDisabled
                    ? "#475569"
                    : "#4ade80",
                borderColor: running
                  ? "rgba(239, 68, 68, 0.3)"
                  : runDisabled
                    ? "rgba(255, 255, 255, 0.06)"
                    : "rgba(34, 197, 94, 0.3)",
                cursor: runDisabled ? "not-allowed" : "pointer",
              }}
              data-testid="eval-run-all"
            >
              {running ? "■ STOP BATCH" : "▶ RUN BATCH"}
            </button>

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
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: "linear-gradient(145deg, #121620 0%, #0d0f15 100%)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
  display: "flex",
  flexDirection: "column",
  minHeight: 520,
};

const headerStyle: React.CSSProperties = {
  padding: "16px 20px 14px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
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
  color: "#94a3b8",
  fontFamily: "Inter, sans-serif",
};

const selectDropdownStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  color: "#e2e8f0",
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  padding: "6px 10px",
  outline: "none",
  cursor: "pointer",
  width: "100%",
};

const numberInputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  color: "#e2e8f0",
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  padding: "4px 8px",
  outline: "none",
  width: 50,
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
  color: "#3b82f6",
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
  color: "#f87171",
  fontFamily: "Inter, sans-serif",
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.15)",
  borderRadius: 5,
  padding: "5px 10px",
  margin: 0,
};
