import type { TaskDraft } from "../../evalDraft";

const SINGLE_CATEGORIES = ["single", "parallel", "select", "abstain"] as const;

interface Props {
  draft: TaskDraft;
  onChange: (d: TaskDraft) => void;
  onRemove: () => void;
  onBack: () => void;
}

/// The Task & Sandbox Configurator: authors one task. A Task-Type toggle switches
/// between a Single-Turn Format task (expected output) and a Multi-Step Agent task
/// (deterministic sandbox mocks + an ordered end-state checklist). The boxes hold
/// the canonical JSON the backend validates.
export function TaskSandboxConfigurator({ draft, onChange, onRemove, onBack }: Props) {
  const isAgentic = draft.category === "agentic";
  const patch = (p: Partial<TaskDraft>) => onChange({ ...draft, ...p, error: null });

  return (
    <div className="rounded-xl overflow-hidden border border-white/10" style={panel} data-testid="task-configurator">
      {/* Header */}
      <div style={header}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
            2. TASK &amp; SANDBOX CONFIGURATOR
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onBack} style={linkBtn} data-testid="configurator-back">‹ Back</button>
            <button type="button" onClick={onRemove} style={{ ...linkBtn, color: "#f87171" }} data-testid="configurator-remove">Delete</button>
          </div>
        </div>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {/* Task ID */}
        <Field label="TASK ID">
          <input
            value={draft.id}
            onChange={(e) => patch({ id: e.target.value })}
            placeholder="e.g. finance-transfer"
            style={input}
            data-testid="configurator-id"
          />
        </Field>

        {/* Task Type toggle */}
        <Field label="TASK TYPE">
          <div style={{ display: "flex", gap: 8 }}>
            <TypeBtn active={!isAgentic} label="◉ Single-Turn Format" onClick={() => { if (isAgentic) patch({ category: "single" }); }} testid="type-single" />
            <TypeBtn active={isAgentic} label="⯐ Multi-Step Agent" onClick={() => { if (!isAgentic) patch({ category: "agentic" }); }} testid="type-agentic" />
          </div>
        </Field>

        {/* System Prompt Override */}
        <Field label="▾ SYSTEM PROMPT OVERRIDE">
          <textarea
            value={draft.prompt}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder="You are a privacy-safe agentic ledger. Use tools to validate accounts before transfers."
            rows={3}
            style={area}
            data-testid="configurator-prompt"
          />
        </Field>

        {/* Tools Schema */}
        <Field label="▾ TOOLS SCHEMA INJECTION (JSON)">
          <textarea
            value={draft.toolsJson}
            onChange={(e) => patch({ toolsJson: e.target.value })}
            rows={6}
            style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
            data-testid="configurator-tools"
          />
        </Field>

        {isAgentic ? (
          <>
            {/* Deterministic Sandbox */}
            <Field label="▾ DETERMINISTIC SANDBOX (Mock Answers)">
              <textarea
                value={draft.mocksJson}
                onChange={(e) => patch({ mocksJson: e.target.value })}
                rows={6}
                placeholder='[ { "call": { "name": "check_balance", "args": { "account_id": "ACC-123" } }, "response": "{\"balance\":450}" } ]'
                style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                data-testid="configurator-mocks"
              />
            </Field>

            {/* End-State Checklist */}
            <Field label="▾ END-STATE CHECKLIST (Success Criteria)">
              <textarea
                value={draft.endStateJson}
                onChange={(e) => patch({ endStateJson: e.target.value })}
                rows={6}
                placeholder='{ "require_sequence": [ { "tool": "check_balance", "args": {…} }, { "tool": "transfer", "args": { "amount": 450 } } ] }'
                style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                data-testid="configurator-endstate"
              />
            </Field>

            {/* Driver B — Fault Injection (lazy-agent traps). Empty = no traps. */}
            <Field label="▾ FAULT INJECTION (Lazy-Agent Traps · JSON)">
              <textarea
                value={draft.faultsJson}
                onChange={(e) => patch({ faultsJson: e.target.value })}
                rows={5}
                placeholder='[ { "call": { "name": "transfer", "args": { "amount": 450 } }, "fault": { "transient_error": { "status_code": 503, "clears_after": 1 } } } ]'
                style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                data-testid="configurator-faults"
              />
            </Field>

            {/* Driver D — semantic-recovery budget. Blank = engine default (2). */}
            <Field label="MAX RECOVERY (Schema-Error Retries)">
              <input
                value={draft.maxRecovery}
                onChange={(e) => patch({ maxRecovery: e.target.value })}
                placeholder="default 2"
                inputMode="numeric"
                style={input}
                data-testid="configurator-max-recovery"
              />
            </Field>
          </>
        ) : (
          <>
            {/* Single-turn category */}
            <Field label="CATEGORY">
              <select value={draft.category} onChange={(e) => patch({ category: e.target.value as TaskDraft["category"] })} style={input} data-testid="configurator-category">
                {SINGLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            {/* Expected output */}
            <Field label="▾ EXPECTED OUTPUT (JSON)">
              <textarea
                value={draft.expectedJson}
                onChange={(e) => patch({ expectedJson: e.target.value })}
                rows={5}
                style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                data-testid="configurator-expected"
              />
            </Field>
          </>
        )}

        {draft.error && (
          <div style={errorBox} data-testid="configurator-error">{draft.error}</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em", fontFamily: "Inter, sans-serif" }}>{label}</span>
      {children}
    </div>
  );
}

function TypeBtn({ active, label, onClick, testid }: { active: boolean; label: string; onClick: () => void; testid: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      aria-pressed={active}
      style={{
        flex: 1,
        padding: "7px 12px",
        borderRadius: 7,
        border: `1px solid ${active ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.1)"}`,
        background: active ? "rgba(59,130,246,0.18)" : "rgba(255,255,255,0.03)",
        color: active ? "#93c5fd" : "#94a3b8",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        fontFamily: "Inter, sans-serif",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const panel: React.CSSProperties = {
  background: "linear-gradient(145deg, #1a1f2e 0%, #161b27 100%)",
  display: "flex",
  flexDirection: "column",
};
const header: React.CSSProperties = { padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" };
const input: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 7,
  color: "#e2e8f0",
  fontSize: 13,
  fontFamily: "Inter, sans-serif",
  padding: "7px 10px",
  outline: "none",
  width: "100%",
};
const area: React.CSSProperties = {
  ...input,
  fontSize: 12,
  lineHeight: 1.5,
  resize: "vertical",
  whiteSpace: "pre",
};
const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#93c5fd",
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  cursor: "pointer",
};
const errorBox: React.CSSProperties = {
  fontSize: 12,
  color: "#f87171",
  background: "rgba(239,68,68,0.08)",
  border: "1px solid rgba(239,68,68,0.18)",
  borderRadius: 6,
  padding: "7px 10px",
  fontFamily: "Inter, sans-serif",
};
