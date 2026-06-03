import type { TaskDraft } from "../../evalDraft";
import type { ToolTaskResult } from "../../../../shared/ipc/eval/toolcall";
import { isPassed, passedBadge, failedBadge } from "../../verdict";

/// The default editor view for a selected collection: a compact, clickable list
/// of its tasks plus collection-level actions (Add Task, Save, Run all). Clicking
/// a row opens that task's detail.
export function TaskListView({
  drafts,
  results,
  dirty,
  modelSelected,
  running,
  onOpen,
  onAddTask,
  onSave,
  onRunAll,
}: {
  drafts: TaskDraft[];
  results: Record<string, ToolTaskResult>;
  dirty: boolean;
  modelSelected: boolean;
  running: boolean;
  onOpen: (key: string) => void;
  onAddTask: () => void;
  onSave: () => void;
  onRunAll: () => void;
}) {
  const runAllDisabled = dirty || !modelSelected || drafts.length === 0 || running;
  const runAllTitle = dirty
    ? "Save changes to run the collection"
    : !modelSelected
      ? "Select a model first"
      : drafts.length === 0
        ? "Add a task first"
        : "Run the whole collection against the selected model";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }} data-testid="eval-task-list">
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#475569", fontFamily: "Inter,sans-serif", flex: 1 }}>
          {drafts.length} task{drafts.length !== 1 ? "s" : ""}
        </span>
        <button type="button" onClick={onAddTask} data-testid="eval-add-task" style={toolbarBtn(false)}>
          + Add Task
        </button>
        <button type="button" onClick={onSave} disabled={drafts.length === 0} data-testid="eval-save" style={toolbarBtn(false, drafts.length === 0)}>
          Save
        </button>
        <button type="button" onClick={onRunAll} disabled={runAllDisabled} data-testid="eval-run-all" title={runAllTitle} style={toolbarBtn(true, runAllDisabled)}>
          {running ? "Running…" : "▶ Run all"}
        </button>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "10px 16px" }}>
        {drafts.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
            <div style={{ fontSize: 32, opacity: 0.2 }}>📋</div>
            <p style={{ fontSize: 13, color: "#475569", fontFamily: "Inter,sans-serif" }}>No tasks yet</p>
            <button type="button" onClick={onAddTask} data-testid="eval-add-task-empty" style={toolbarBtn(true)}>
              + Add Task
            </button>
          </div>
        ) : (
          drafts.map((draft, i) => {
            const result = draft.id.trim() ? results[draft.id.trim()] : undefined;
            const passed = result ? isPassed(result) : null;
            return (
              <button
                key={draft.key}
                type="button"
                onClick={() => onOpen(draft.key)}
                data-testid={`eval-task-row-${draft.id || i}`}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${draft.error ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 9,
                  padding: "10px 14px",
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 11, color: "#475569", fontFamily: "Inter,sans-serif", width: 24, flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 13, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace", width: 150, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {draft.id || "(unnamed)"}
                </span>
                <span style={categoryBadge}>{draft.category}</span>
                <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Inter,sans-serif", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {draft.prompt || "—"}
                </span>
                {passed != null && (
                  <span style={passed ? passedBadge : failedBadge}>{passed ? "Pass" : "Fail"}</span>
                )}
                <span style={{ fontSize: 14, color: "#475569", flexShrink: 0 }}>›</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

const categoryBadge: React.CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  fontFamily: "Inter,sans-serif",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 5,
  padding: "1px 7px",
  flexShrink: 0,
};

function toolbarBtn(primary: boolean, disabled = false): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.1)",
    background: disabled
      ? "rgba(255,255,255,0.04)"
      : primary
        ? "rgba(59,130,246,0.18)"
        : "rgba(255,255,255,0.06)",
    color: disabled ? "#334155" : primary ? "#93c5fd" : "#94a3b8",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "Inter,sans-serif",
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
  };
}
