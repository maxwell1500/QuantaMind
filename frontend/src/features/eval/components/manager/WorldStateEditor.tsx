import { useState } from "react";
import type { ToolTask } from "../../../../shared/ipc/eval/registry";
import { validateWorldStateShape } from "../../env/worldStateShape";

/// Edit a task's environment snapshot (`agentic.world_state`) as JSON. The textarea is trivial; the
/// VALIDATION is the point — Save is disabled until the text both (1) parses as JSON and (2) matches
/// the env's expected shape, so a typo can never be saved into a confusing run failure. On a valid
/// save the parsed value is handed up; the caller writes it into the in-memory task (editing a
/// bundled collection then makes its run unpublishable via the backend's content-verified hash).
export function WorldStateEditor({ task, onClose, onSave }: { task: ToolTask; onClose: () => void; onSave: (worldState: unknown) => void }) {
  const env = task.agentic?.environment;
  const [text, setText] = useState(() => JSON.stringify(task.agentic?.world_state ?? {}, null, 2));

  // Gate 1: JSON parse. Gate 2: per-env shape. `error` is the first that fails (inline message).
  let parsed: unknown;
  let error: string | null = null;
  try {
    parsed = JSON.parse(text);
    error = validateWorldStateShape(env, parsed);
  } catch (e) {
    error = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
  }
  const valid = error === null;

  return (
    <div style={overlay} role="dialog" data-testid="world-state-editor">
      <div style={panel}>
        <div style={headerRow}>
          <span style={{ fontWeight: 700 }}>Edit environment — {task.id}</span>
          {env && <span style={envChip}>{env}</span>}
        </div>
        <div style={note}>Editing this snapshot makes the collection local-only — its results won't publish.</div>
        <textarea
          data-testid="world-state-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          style={textareaStyle}
        />
        <div style={{ minHeight: 18 }}>
          {error && (
            <span style={errStyle} data-testid="world-state-error">
              {error}
            </span>
          )}
        </div>
        <div style={actions}>
          <button type="button" onClick={onClose} style={btn} data-testid="world-state-cancel">
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => valid && onSave(parsed)}
            style={{ ...btn, ...(valid ? saveBtn : disabledBtn) }}
            data-testid="world-state-save"
          >
            Save (local-only)
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};
const panel: React.CSSProperties = {
  background: "#ffffff",
  borderRadius: 10,
  padding: 16,
  width: "min(680px, 92vw)",
  boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
  fontFamily: "Inter, sans-serif",
};
const headerRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#0f172a" };
const envChip: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 6px",
  borderRadius: 4,
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #dbeafe",
};
const note: React.CSSProperties = { fontSize: 11, color: "#b45309", margin: "6px 0 8px" };
const textareaStyle: React.CSSProperties = {
  width: "100%",
  height: 280,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  padding: 8,
  resize: "vertical",
  color: "#0f172a",
};
const errStyle: React.CSSProperties = { fontSize: 11, color: "#b91c1c", fontFamily: "ui-monospace, Menlo, monospace" };
const actions: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 };
const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 6, cursor: "pointer", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#334155" };
const saveBtn: React.CSSProperties = { background: "#0f172a", color: "#ffffff", borderColor: "#0f172a" };
const disabledBtn: React.CSSProperties = { background: "#e2e8f0", color: "#94a3b8", cursor: "not-allowed", borderColor: "#e2e8f0" };
