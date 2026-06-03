import { useEffect, useState, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEvalRegistryStore, NEW_COLLECTION } from "../../state/evalRegistryStore";
import { type TaskDraft, draftFromTask, newDraft, validateDrafts } from "../../evalDraft";
import { runToolcallEval, type ToolCallReport, type ToolTaskResult } from "../../../../shared/ipc/eval/toolcall";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { modelLabel } from "../../../../shared/models/modelLabel";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { NameDialog } from "./NameDialog";
import { TaskListView } from "./TaskListView";
import { TaskDetailView } from "./TaskDetailView";
import { StatsBar } from "./StatsBar";

/// The eval collection manager: a sidebar of collections (built-in presets +
/// custom, with create/delete) and a master-detail editor — a task list that
/// drills into a per-task detail. Run a single task live, or the saved collection.
export function EvalManager() {
  const { presets, collections, selected, tasks, init, startNew, select, save, remove, isPreset, importFile } =
    useEvalRegistryStore();
  const list = useInstalledModelsStore((s) => s.list);

  const [drafts, setDrafts] = useState<TaskDraft[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [model, setModel] = useState("");
  const [openTaskKey, setOpenTaskKey] = useState<string | null>(null);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [results, setResults] = useState<Record<string, ToolTaskResult>>({});
  const [report, setReport] = useState<ToolCallReport | null>(null);
  const [running, setRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedIsPreset = isPreset(selected);
  const isNewSel = selected === NEW_COLLECTION;
  const modelSelected = list.some((m) => m.name === model);
  const openDraft = openTaskKey ? drafts.find((d) => d.key === openTaskKey) ?? null : null;
  const openIndex = openDraft ? drafts.findIndex((d) => d.key === openDraft.key) : -1;

  // Init on mount.
  useEffect(() => {
    void init().catch(() => {});
  }, [init]);

  // Seed the editor on selection change. A new collection starts empty (the modal
  // owns its name, so don't overwrite it here); presets/customs load editable
  // drafts. Always drop back to the list view and clear run state + dirty.
  useEffect(() => {
    const isNew = selected === NEW_COLLECTION;
    setDrafts(isNew ? [] : tasks.map(draftFromTask));
    if (!isNew) setCollectionName(selected);
    setOpenTaskKey(null);
    setDirty(false);
    setResults({});
    setReport(null);
    setSaveStatus(null);
    setError(null);
  }, [tasks, selected]);

  // Any edit invalidates the last run and requires a re-save before Run all.
  const markDirty = () => {
    setDirty(true);
    setResults({});
    setReport(null);
    setSaveStatus(null);
  };

  const handleSelect = useCallback(
    async (id: string) => {
      try {
        await select(id);
      } catch (e) {
        setError(formatIpcError(e));
      }
    },
    [select],
  );

  const handleCreateCollection = (name: string) => {
    startNew();
    setCollectionName(name);
    setNameModalOpen(false);
  };

  const handleAddTask = () => {
    const d = newDraft();
    setDrafts((prev) => [...prev, d]);
    setOpenTaskKey(d.key);
    markDirty();
  };

  const handleRemoveTask = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    setOpenTaskKey((cur) => (cur === key ? null : cur));
    markDirty();
  };

  const handleDraftChange = (key: string, nd: TaskDraft) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? nd : d)));
    markDirty();
  };

  const handleSave = async () => {
    if (!collectionName.trim()) {
      setSaveStatus("⚠ Enter a collection name");
      return;
    }
    const v = validateDrafts(drafts);
    if (!v.ok) {
      setDrafts(v.drafts);
      setSaveStatus(v.message);
      return;
    }
    try {
      await save(collectionName.trim(), v.tasks);
      setSaveStatus(`✓ Saved "${collectionName.trim()}"`);
    } catch (e) {
      setSaveStatus(`✗ ${formatIpcError(e)}`);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await remove(name);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const handleImport = async () => {
    try {
      const picked = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (typeof picked === "string") await importFile(picked);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const handleRunAll = async () => {
    const m = list.find((x) => x.name === model);
    if (!m || dirty || tasks.length === 0) return;
    setRunning(true);
    setReport(null);
    try {
      const r = await runToolcallEval(m.name, m.backend, tasks);
      setReport(r);
      const map: Record<string, ToolTaskResult> = {};
      r.per_task.forEach((pt) => { map[pt.id] = pt; });
      setResults(map);
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setRunning(false);
    }
  };

  const handleRunTask = async () => {
    const m = list.find((x) => x.name === model);
    if (!m || !openDraft) return;
    const v = validateDrafts([openDraft]);
    if (!v.ok) {
      setDrafts((prev) => prev.map((d) => (d.key === openDraft.key ? v.drafts[0] : d)));
      return;
    }
    setRunning(true);
    try {
      const r = await runToolcallEval(m.name, m.backend, v.tasks);
      const pt = r.per_task[0];
      if (pt) setResults((prev) => ({ ...prev, [pt.id]: pt }));
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setRunning(false);
    }
  };

  const panelTitle = isNewSel
    ? collectionName || "New Collection"
    : selectedIsPreset
      ? (presets.find((p) => p.id === selected)?.label ?? selected)
      : selected;

  return (
    <div
      className="rounded-xl overflow-hidden border border-white/10"
      style={{
        background: "linear-gradient(145deg, #1a1f2e 0%, #161b27 100%)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        minHeight: 480,
        maxHeight: 620,
        display: "flex",
        flexDirection: "column",
      }}
      data-testid="eval-manager"
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", letterSpacing: "-0.01em" }}>
          Local AI Eval Manager
        </h2>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          data-testid="eval-manager-model-select"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#94a3b8", fontSize: 12, fontFamily: "Inter,sans-serif", padding: "5px 10px", outline: "none", cursor: "pointer" }}
        >
          <option value="">Select model…</option>
          {list.map((m) => (
            <option key={m.name} value={m.name}>{modelLabel(m)}</option>
          ))}
        </select>
      </div>

      {error && (
        <div style={{ padding: "6px 20px" }}>
          <p style={{ fontSize: 11, color: "#f87171", fontFamily: "Inter,sans-serif", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 5, padding: "5px 10px" }}>
            {error}
          </p>
        </div>
      )}

      {/* Body: sidebar + editor */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.07)", padding: "14px 10px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#475569", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "Inter,sans-serif", paddingLeft: 4, marginBottom: 8 }}>
            Eval Collections
          </div>

          {presets.map((p) => (
            <SidebarItem key={p.id} label={p.label} active={selected === p.id} onClick={() => void handleSelect(p.id)} isPreset />
          ))}

          {collections.length > 0 && <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 4px" }} />}

          {collections.map((c) => (
            <SidebarItem key={c} label={c} active={selected === c} onClick={() => void handleSelect(c)} onDelete={() => void handleDelete(c)} isPreset={false} />
          ))}

          {isNewSel && <SidebarItem label={collectionName || "New Collection"} active onClick={() => {}} isPreset={false} />}

          <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <button type="button" onClick={() => setNameModalOpen(true)} data-testid="eval-manager-new" style={sidebarActionBtn}>
              + New Collection
            </button>
            <button type="button" onClick={() => void handleImport()} data-testid="eval-manager-import" style={sidebarActionBtn}>
              Import .json
            </button>
          </div>
        </div>

        {/* Editor: list or detail */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {/* Panel header */}
          <div style={{ padding: "12px 20px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter,sans-serif", flex: 1 }}>{panelTitle}</h3>
            <input
              value={collectionName}
              onChange={(e) => { setCollectionName(e.target.value); setDirty(true); setSaveStatus(null); }}
              placeholder="Collection name"
              data-testid="eval-manager-name"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#94a3b8", fontSize: 12, fontFamily: "Inter,sans-serif", padding: "4px 10px", outline: "none", width: 180 }}
            />
          </div>

          {selectedIsPreset && (
            <div style={{ padding: "6px 20px 0", flexShrink: 0 }}>
              <p style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter,sans-serif", margin: 0 }}>
                Editing a built-in preset — Save creates an editable copy in your collections.
              </p>
            </div>
          )}

          {openDraft ? (
            <TaskDetailView
              draft={openDraft}
              index={openIndex}
              onChange={(d) => handleDraftChange(openDraft.key, d)}
              onRemove={() => handleRemoveTask(openDraft.key)}
              onBack={() => setOpenTaskKey(null)}
              onRun={() => void handleRunTask()}
              result={results[openDraft.id.trim()]}
              running={running}
              modelSelected={modelSelected}
            />
          ) : (
            <TaskListView
              drafts={drafts}
              results={results}
              dirty={dirty}
              modelSelected={modelSelected}
              running={running}
              onOpen={(key) => setOpenTaskKey(key)}
              onAddTask={handleAddTask}
              onSave={() => void handleSave()}
              onRunAll={() => void handleRunAll()}
            />
          )}

          {saveStatus && (
            <div style={{ padding: "4px 20px" }}>
              <p style={{ fontSize: 12, color: saveStatus.startsWith("✓") ? "#4ade80" : "#f87171", fontFamily: "Inter,sans-serif" }} data-testid="eval-manager-status">
                {saveStatus}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Aggregate stats (Run all) */}
      <StatsBar scores={report} />

      {nameModalOpen && <NameDialog onCreate={handleCreateCollection} onClose={() => setNameModalOpen(false)} />}
    </div>
  );
}

// ── Sidebar item ────────────────────────────────────────────────────────────

function SidebarItem({
  label,
  active,
  onClick,
  onDelete,
  isPreset,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  isPreset: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "9px 14px",
        borderRadius: 8,
        cursor: "pointer",
        background: active
          ? "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)"
          : hovered
            ? "rgba(255,255,255,0.05)"
            : "transparent",
        transition: "background 0.15s",
        marginBottom: 2,
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: 13, color: active ? "#fff" : hovered ? "#e2e8f0" : "#94a3b8", fontFamily: "Inter,sans-serif", fontWeight: active ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
        {label}
      </span>
      {!isPreset && onDelete && hovered && !active && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete collection"
          style={{ background: "transparent", border: "none", color: "#ef4444", fontSize: 12, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

const sidebarActionBtn: React.CSSProperties = {
  width: "100%",
  padding: "7px 0",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 7,
  color: "#64748b",
  fontSize: 12,
  fontFamily: "Inter,sans-serif",
  cursor: "pointer",
  textAlign: "center",
  transition: "all 0.15s",
};
