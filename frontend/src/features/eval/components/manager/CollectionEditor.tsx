import { useEffect, useState } from "react";
import { useEvalRegistryStore, NEW_COLLECTION } from "../../state/evalRegistryStore";
import { draftFromTask, newDraft, validateDrafts, type TaskDraft } from "../../evalDraft";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { TaskListView } from "./TaskListView";
import { TaskSandboxConfigurator } from "./TaskSandboxConfigurator";
import { NameDialog } from "./NameDialog";
import { ConfirmDialog } from "./ConfirmDialog";

/// The authoring surface (center column in edit mode): the collection's task list
/// and, when a task is opened, the Task & Sandbox Configurator. Holds the editable
/// drafts, validates them through the shared `evalDraft` path, and persists via
/// `evalRegistryStore.save` (a preset edit saves a new custom copy).
export function CollectionEditor({ onClose }: { onClose: () => void }) {
  const { selected, tasks, save, isPreset } = useEvalRegistryStore();
  const [drafts, setDrafts] = useState<TaskDraft[]>(() => tasks.map(draftFromTask));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // Re-seed when the active collection changes.
  useEffect(() => {
    setDrafts(tasks.map(draftFromTask));
    setOpenKey(null);
    setDirty(false);
    setStatus(null);
  }, [selected, tasks]);

  const open = drafts.find((d) => d.key === openKey) ?? null;

  const addTask = () => {
    const d = newDraft();
    setDrafts((p) => [...p, d]);
    setOpenKey(d.key);
    setDirty(true);
  };
  const changeDraft = (nd: TaskDraft) => {
    setDrafts((p) => p.map((d) => (d.key === nd.key ? nd : d)));
    setDirty(true);
  };
  const performRemove = () => {
    if (!confirmKey) return;
    const key = confirmKey;
    setConfirmKey(null);
    setDrafts((p) => p.filter((d) => d.key !== key));
    setOpenKey((k) => (k === key ? null : k));
    setDirty(true);
  };

  const persist = async (name: string) => {
    const r = validateDrafts(drafts);
    if (!r.ok) {
      setDrafts(r.drafts);
      setStatus(r.message);
      return;
    }
    try {
      await save(name, r.tasks);
      setDirty(false);
      setStatus("Saved ✓");
    } catch (e) {
      setStatus(formatIpcError(e));
    }
  };

  const onSave = () => {
    setStatus(null);
    // A preset or a brand-new collection needs a name; a custom one saves in place.
    if (isPreset(selected) || selected === NEW_COLLECTION) setNameOpen(true);
    else void persist(selected);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="collection-editor">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Inter, sans-serif" }}>
          Editing:{" "}
          <strong style={{ color: "#0f172a" }}>{selected === NEW_COLLECTION ? "(new collection)" : selected}</strong>
          {isPreset(selected) && <span style={{ color: "#64748b" }}> — preset, saves a copy</span>}
        </span>
        <button type="button" onClick={onClose} style={doneBtn} data-testid="editor-done">
          Done ✓
        </button>
      </div>

      {open ? (
        <TaskSandboxConfigurator draft={open} onChange={changeDraft} onRemove={() => setConfirmKey(open.key)} onBack={() => setOpenKey(null)} />
      ) : (
        <div className="rounded-xl overflow-hidden border border-slate-200" style={listPanel}>
          <TaskListView
            drafts={drafts}
            results={{}}
            dirty={dirty}
            modelSelected={false}
            running={false}
            onOpen={setOpenKey}
            onAddTask={addTask}
            onSave={onSave}
            onDeleteTask={setConfirmKey}
          />
        </div>
      )}

      {status && (
        <div
          style={{ fontSize: 12, color: status.startsWith("Saved") ? "#166534" : "#b91c1c", fontFamily: "Inter, sans-serif" }}
          data-testid="editor-status"
        >
          {status}
        </div>
      )}

      {nameOpen && (
        <NameDialog
          onCreate={(name) => {
            setNameOpen(false);
            void persist(name);
          }}
          onClose={() => setNameOpen(false)}
        />
      )}

      {confirmKey && (
        <ConfirmDialog
          title="Delete task"
          message="Remove this task from the collection? Click Save afterwards to persist the change."
          onConfirm={performRemove}
          onClose={() => setConfirmKey(null)}
        />
      )}
    </div>
  );
}

const doneBtn: React.CSSProperties = {
  padding: "5px 14px",
  borderRadius: 7,
  border: "1px solid #bbf7d0",
  background: "#dcfce7",
  color: "#166534",
  fontSize: 12,
  fontWeight: 600,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer",
};

const listPanel: React.CSSProperties = {
  background: "#ffffff",
  minHeight: 360,
  display: "flex",
  flexDirection: "column",
};
