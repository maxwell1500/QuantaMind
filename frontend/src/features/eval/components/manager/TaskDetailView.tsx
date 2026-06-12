import type { TaskDraft } from "../../evalDraft";
import type { ToolTask } from "../../../../shared/ipc/eval/registry";
import type { ToolTaskResult } from "../../../../shared/ipc/eval/toolcall";
import { verdictToScores, traceDiag } from "../../verdict";
import { StatsBar } from "./StatsBar";

/// Single-task editor: edit one task's fields, run just this task, and see its
/// verdict + the four sub-scores.
export function TaskDetailView({
  draft,
  index,
  onChange,
  onRemove,
  onBack,
  onRun,
  result,
  running,
  modelSelected,
}: {
  draft: TaskDraft;
  index: number;
  onChange: (d: TaskDraft) => void;
  onRemove: () => void;
  onBack: () => void;
  onRun: () => void;
  result: ToolTaskResult | undefined;
  running: boolean;
  modelSelected: boolean;
}) {
  const update = (patch: Partial<TaskDraft>) => onChange({ ...draft, ...patch, error: null });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }} data-testid="eval-task-detail">
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
        <button type="button" onClick={onBack} data-testid="eval-task-back" style={btn(false)}>
          ← Back
        </button>
        <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Inter,sans-serif", flex: 1 }}>
          Task {index + 1}
        </span>
        <button type="button" onClick={onRemove} data-testid="eval-task-remove" style={btn(false)}>
          Remove
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={!modelSelected || running}
          data-testid="eval-run-task"
          title={modelSelected ? "Run just this task" : "Select a model first"}
          style={btn(true, !modelSelected || running)}
        >
          {running ? "Running…" : "▶ Run this task"}
        </button>
      </div>

      {/* Editor + result */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "14px 20px" }}>
        {/* Header fields */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Task ID</label>
            <input
              value={draft.id}
              onChange={(e) => update({ id: e.target.value })}
              placeholder="task-id"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select
              value={draft.category}
              onChange={(e) => update({ category: e.target.value as ToolTask["category"] })}
              style={inputStyle}
            >
              {(["single", "select", "parallel", "abstain"] as const).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>System Prompt</label>
          <textarea
            value={draft.prompt}
            onChange={(e) => update({ prompt: e.target.value })}
            placeholder="What's the weather in Paris right now?"
            rows={2}
            style={textareaStyle(draft.error === "Prompt: required")}
            spellCheck={false}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Available Tools (JSON)</label>
          <textarea
            value={draft.toolsJson}
            onChange={(e) => update({ toolsJson: e.target.value })}
            placeholder='[{"name": "get_weather", ...}]'
            rows={6}
            style={textareaStyle(draft.error?.startsWith("Tools:") ?? false)}
            spellCheck={false}
          />
        </div>

        <div style={{ marginBottom: draft.error ? 8 : 0 }}>
          <label style={labelStyle}>Expected Output (JSON)</label>
          <textarea
            value={draft.expectedJson}
            onChange={(e) => update({ expectedJson: e.target.value })}
            placeholder='{"type": "call", "name": "get_weather", "args": {"city": "Paris"}}'
            rows={3}
            style={textareaStyle(draft.error?.startsWith("Expected") ?? false)}
            spellCheck={false}
          />
        </div>

        {draft.error && (
          <p style={{ fontSize: 11, color: "#f87171", fontFamily: "Inter,sans-serif", margin: "4px 0 0" }} data-testid="eval-task-error">
            {draft.error}
          </p>
        )}

        {/* Result */}
        {result && (
          <div style={{ marginTop: 18 }} data-testid="eval-task-result">
            <label style={labelStyle}>Result</label>
            <div style={{ borderRadius: 9, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
              <StatsBar scores={verdictToScores(result)} />
            </div>
            <VerdictChecklist result={result} />
          </div>
        )}
      </div>
    </div>
  );
}

function VerdictChecklist({ result }: { result: ToolTaskResult }) {
  const v = result.verdict;
  const isAbstain = result.category === "abstain";
  const rows: Array<{ label: string; state: boolean | null }> = isAbstain
    ? [{ label: "Abstained correctly", state: v.abstain_correct }]
    : [
        { label: "Parsed JSON", state: v.parsed },
        { label: "Right tool", state: v.tool_match },
        { label: "Right args", state: v.args_match },
      ];
  const diag = traceDiag(null, result);

  return (
    <div style={{ marginTop: 10 }} data-testid="eval-verdict-checklist">
      {rows.map(({ label, state }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
          <span style={{ width: 16, color: state == null ? "#475569" : state ? "#4ade80" : "#f87171" }}>
            {state == null ? "—" : state ? "✓" : "✗"}
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Inter,sans-serif" }}>{label}</span>
        </div>
      ))}
      <p style={{ fontSize: 12, color: diag.ok ? "#4ade80" : "#f87171", fontFamily: "Inter,sans-serif", margin: "6px 0 0" }}>
        {diag.msg}
      </p>
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 500,
  color: "#64748b",
  fontFamily: "Inter,sans-serif",
  marginBottom: 5,
  letterSpacing: "0.02em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  color: "#e2e8f0",
  fontSize: 12,
  fontFamily: "Inter,sans-serif",
  padding: "6px 10px",
  outline: "none",
  boxSizing: "border-box",
};

const textareaStyle = (hasError: boolean): React.CSSProperties => ({
  width: "100%",
  background: "rgba(0,0,0,0.3)",
  border: `1px solid ${hasError ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}`,
  borderRadius: 7,
  color: "#e2e8f0",
  fontSize: 12,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  lineHeight: 1.6,
  padding: "8px 10px",
  resize: "vertical",
  outline: "none",
  boxSizing: "border-box",
});

function btn(primary: boolean, disabled = false): React.CSSProperties {
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
