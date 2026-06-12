import type { TaskDraft } from "../../evalDraft";
import type { ToolTaskResult } from "../../../../shared/ipc/eval/toolcall";
import { isPassed, passedBadge, failedBadge } from "../../verdict";
import { KebabMenu } from "./KebabMenu";

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
  onDeleteTask,
}: {
  drafts: TaskDraft[];
  results: Record<string, ToolTaskResult>;
  dirty: boolean;
  modelSelected: boolean;
  running: boolean;
  onOpen: (key: string) => void;
  onAddTask: () => void;
  onSave: () => void;
  /// Optional — omitted in the authoring editor, where running is driven from the
  /// Eval Manager's Run Batch instead.
  onRunAll?: () => void;
  /// Optional per-row delete (the editor wires this to a confirm dialog).
  onDeleteTask?: (key: string) => void;
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
          borderBottom: "1px solid #e2e8f0",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter,sans-serif", flex: 1 }}>
          {drafts.length} task{drafts.length !== 1 ? "s" : ""}
        </span>
        <button type="button" onClick={onAddTask} data-testid="eval-add-task" style={toolbarBtn(false)}>
          + Add Task
        </button>
        <button type="button" onClick={onSave} disabled={drafts.length === 0} data-testid="eval-save" style={toolbarBtn(false, drafts.length === 0)}>
          Save
        </button>
        {onRunAll && (
          <button type="button" onClick={onRunAll} disabled={runAllDisabled} data-testid="eval-run-all" title={runAllTitle} style={toolbarBtn(true, runAllDisabled)}>
            {running ? "Running…" : "Run all"}
          </button>
        )}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "10px 16px" }}>
        {drafts.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
            <svg style={{ width: 40, height: 40, color: "#cbd5e1" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <p style={{ fontSize: 13, color: "#64748b", fontFamily: "Inter,sans-serif" }}>No tasks yet</p>
            <button type="button" onClick={onAddTask} data-testid="eval-add-task-empty" style={toolbarBtn(true)}>
              + Add Task
            </button>
          </div>
        ) : (
          drafts.map((draft, i) => {
            const result = draft.id.trim() ? results[draft.id.trim()] : undefined;
            const passed = result ? isPassed(result) : null;
            return (
              <div key={draft.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={() => onOpen(draft.key)}
                  data-testid={`eval-task-row-${draft.id || i}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textAlign: "left",
                    background: "#ffffff",
                    border: `1px solid ${draft.error ? "#fca5a5" : "#e2e8f0"}`,
                    borderRadius: 9,
                    padding: "10px 14px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#64748b", fontFamily: "Inter,sans-serif", width: 24, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace", width: 150, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {draft.id || "(unnamed)"}
                  </span>
                  <span style={categoryBadge}>{draft.category}</span>
                  <span style={{ fontSize: 12, color: "#475569", fontFamily: "Inter,sans-serif", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {draft.prompt || "—"}
                  </span>
                  {passed != null && (
                    <span style={passed ? passedBadge : failedBadge}>{passed ? "Pass" : "Fail"}</span>
                  )}
                  <span style={{ fontSize: 14, color: "#94a3b8", flexShrink: 0 }}>›</span>
                </button>
                {onDeleteTask && (
                  <KebabMenu
                    testid={`eval-task-menu-${draft.id || i}`}
                    items={[{ label: "Delete task", danger: true, onClick: () => onDeleteTask(draft.key), testid: `eval-delete-task-${draft.id || i}` }]}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const categoryBadge: React.CSSProperties = {
  fontSize: 10,
  color: "#475569",
  fontFamily: "Inter,sans-serif",
  background: "#f1f5f9",
  border: "1px solid #e2e8f0",
  borderRadius: 5,
  padding: "1px 7px",
  flexShrink: 0,
};

function toolbarBtn(primary: boolean, disabled = false): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 7,
    border: `1px solid ${disabled ? "#e2e8f0" : primary ? "#bfdbfe" : "#cbd5e1"}`,
    background: disabled
      ? "#f1f5f9"
      : primary
        ? "#eff6ff"
        : "#ffffff",
    color: disabled ? "#94a3b8" : primary ? "#2563eb" : "#334155",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "Inter,sans-serif",
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
  };
}
