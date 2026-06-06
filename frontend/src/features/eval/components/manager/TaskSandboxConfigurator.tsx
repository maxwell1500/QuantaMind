import type { TaskDraft } from "../../evalDraft";

const SINGLE_CATEGORIES = ["single", "parallel", "select", "abstain"] as const;

interface Props {
  draft: TaskDraft;
  onChange: (d: TaskDraft) => void;
  onRemove: () => void;
  onBack: () => void;
}

export function TaskSandboxConfigurator({ draft, onChange, onRemove, onBack }: Props) {
  const isAgentic = draft.category === "agentic";
  const patch = (p: Partial<TaskDraft>) => onChange({ ...draft, ...p, error: null });

  return (
    <div
      className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm transition-all duration-300"
      style={panel}
      data-testid="task-configurator"
    >
      {/* Header */}
      <div style={header}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="flex h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "Inter, sans-serif", letterSpacing: "0.03em" }}>
              TASK &amp; SANDBOX CONFIGURATOR
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 hover:text-blue-700 transition-all cursor-pointer"
              data-testid="configurator-back"
            >
              ‹ Back
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 hover:text-red-700 transition-all cursor-pointer"
              data-testid="configurator-remove"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 18px", display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", maxHeight: "85vh" }}>
        
        {/* SECTION 1: CORE DEFINITIONS */}
        <div style={sectionGroup}>
          <div style={sectionTitle}>1. Core Definitions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Task ID */}
            <Field label="TASK ID">
              <input
                value={draft.id}
                onChange={(e) => patch({ id: e.target.value })}
                placeholder="e.g. finance-transfer"
                className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
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
                className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                style={area}
                data-testid="configurator-prompt"
              />
            </Field>
          </div>
        </div>

        {/* SECTION 2: TOOLS & EXPECTED STATE */}
        <div style={sectionGroup}>
          <div style={sectionTitle}>2. Schema &amp; Expectations</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Tools Schema */}
            <Field label="▾ TOOLS SCHEMA INJECTION (JSON)">
              <textarea
                value={draft.toolsJson}
                onChange={(e) => patch({ toolsJson: e.target.value })}
                rows={5}
                className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
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
                    rows={5}
                    placeholder='[ { "call": { "name": "check_balance", "args": { "account_id": "ACC-123" } }, "response": "{\"balance\":450}" } ]'
                    className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                    data-testid="configurator-mocks"
                  />
                </Field>

                {/* End-State Checklist */}
                <Field label="▾ END-STATE CHECKLIST (Success Criteria)">
                  <textarea
                    value={draft.endStateJson}
                    onChange={(e) => patch({ endStateJson: e.target.value })}
                    rows={5}
                    placeholder='{ "require_sequence": [ { "tool": "check_balance", "args": {…} }, { "tool": "transfer", "args": { "amount": 450 } } ] }'
                    className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                    data-testid="configurator-endstate"
                  />
                </Field>
              </>
            ) : (
              <>
                {/* Single-turn category */}
                <Field label="CATEGORY">
                  <select
                    value={draft.category}
                    onChange={(e) => patch({ category: e.target.value as TaskDraft["category"] })}
                    className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    style={input}
                    data-testid="configurator-category"
                  >
                    {SINGLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>

                {/* Expected output */}
                <Field label="▾ EXPECTED OUTPUT (JSON)">
                  <textarea
                    value={draft.expectedJson}
                    onChange={(e) => patch({ expectedJson: e.target.value })}
                    rows={4}
                    className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                    data-testid="configurator-expected"
                  />
                </Field>
              </>
            )}
          </div>
        </div>

        {/* SECTION 3: RESILIENCE & FAULTS (Agentic Only) */}
        {isAgentic && (
          <div style={sectionGroup}>
            <div style={sectionTitle}>3. Stress Testing &amp; Resilience</div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Driver B info banner */}
              <div style={infoBannerB}>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 3, display: "flex", alignItems: "center", gap: 4, color: "#1e40af" }}>
                  DRIVER B: FAULT INJECTION (LAZY-AGENT TRAPS)
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.4, color: "#475569" }}>
                  Inject errors (e.g. transient 503 HTTP or persistent 500) to check if the model retries robustly or halts honestly. Leaving empty disables traps.
                </div>
              </div>

              {/* Driver B — Fault Injection */}
              <Field label="▾ FAULT INJECTION SPEC (JSON)">
                <textarea
                  value={draft.faultsJson}
                  onChange={(e) => patch({ faultsJson: e.target.value })}
                  rows={4}
                  placeholder='[ { "call": { "name": "transfer", "args": { "amount": 450 } }, "fault": { "transient_error": { "status_code": 503, "clears_after": 1 } } } ]'
                  className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                  data-testid="configurator-faults"
                />
              </Field>

              {/* Driver D info banner */}
              <div style={infoBannerD}>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 3, display: "flex", alignItems: "center", gap: 4, color: "#854d0e" }}>
                  DRIVER D: SEMANTIC RECOVERY BUDGET
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.4, color: "#475569" }}>
                  Controls the budget for schema error self-correction runs. Omission defaults to 2 retries.
                </div>
              </div>

              {/* Driver D — semantic-recovery budget */}
              <Field label="MAX RECOVERY (SCHEMA-ERROR RETRIES)">
                <input
                  value={draft.maxRecovery}
                  onChange={(e) => patch({ maxRecovery: e.target.value })}
                  placeholder="default 2"
                  inputMode="numeric"
                  className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  style={input}
                  data-testid="configurator-max-recovery"
                />
              </Field>
            </div>
          </div>
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
      <span style={{ fontSize: 10, fontWeight: 800, color: "#64748b", letterSpacing: "0.05em", fontFamily: "Inter, sans-serif" }}>{label}</span>
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
        padding: "8px 12px",
        borderRadius: 8,
        border: `1px solid ${active ? "#bfdbfe" : "#cbd5e1"}`,
        background: active ? "#eff6ff" : "#ffffff",
        color: active ? "#1d4ed8" : "#475569",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        fontFamily: "Inter, sans-serif",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      {label}
    </button>
  );
}

const panel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "16px",
  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
  display: "flex",
  flexDirection: "column",
};
const header: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid #e2e8f0",
  background: "#fafafa",
};
const input: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  color: "#0f172a",
  fontSize: 13,
  fontFamily: "Inter, sans-serif",
  padding: "8px 12px",
  width: "100%",
};
const area: React.CSSProperties = {
  ...input,
  fontSize: 12,
  lineHeight: 1.5,
  resize: "vertical",
  whiteSpace: "pre",
};
const errorBox: React.CSSProperties = {
  fontSize: 12,
  color: "#b91c1c",
  background: "#fef2f2",
  border: "1px solid #fee2e2",
  borderRadius: 8,
  padding: "10px 14px",
  fontFamily: "Inter, sans-serif",
};
const sectionGroup: React.CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "16px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  color: "#2563eb",
  letterSpacing: "0.06em",
  fontFamily: "Inter, sans-serif",
  borderBottom: "1px solid #cbd5e1",
  paddingBottom: 4,
  marginBottom: 8,
};
const infoBannerB: React.CSSProperties = {
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: "Inter, sans-serif",
};
const infoBannerD: React.CSSProperties = {
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: "Inter, sans-serif",
};
