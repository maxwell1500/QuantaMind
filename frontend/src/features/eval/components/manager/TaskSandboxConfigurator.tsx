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
      className="rounded-2xl overflow-hidden border border-blue-500/20 shadow-2xl transition-all duration-300"
      style={panel}
      data-testid="task-configurator"
    >
      {/* Header */}
      <div style={header}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="flex h-2.5 w-2.5 rounded-full bg-blue-400 animate-pulse" />
            <span style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", fontFamily: "Inter, sans-serif", letterSpacing: "0.03em" }}>
              TASK &amp; SANDBOX CONFIGURATOR
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 hover:text-blue-200 transition-all cursor-pointer"
              data-testid="configurator-back"
            >
              ‹ Back
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all cursor-pointer"
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
                className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
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
                className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
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
                className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
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
                    className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
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
                    className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
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
                    className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
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
                    className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
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
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>🛡️</span> DRIVER B: FAULT INJECTION (LAZY-AGENT TRAPS)
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.4, color: "#94a3b8" }}>
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
                  className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                  style={{ ...area, fontFamily: "'JetBrains Mono', monospace" }}
                  data-testid="configurator-faults"
                />
              </Field>

              {/* Driver D info banner */}
              <div style={infoBannerD}>
                <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>🔄</span> DRIVER D: SEMANTIC RECOVERY BUDGET
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.4, color: "#94a3b8" }}>
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
                  className="transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
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
        border: `1px solid ${active ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.06)"}`,
        background: active ? "linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.1) 100%)" : "rgba(255,255,255,0.02)",
        color: active ? "#a5f3fc" : "#94a3b8",
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        fontFamily: "Inter, sans-serif",
        cursor: "pointer",
        boxShadow: active ? "0 4px 12px rgba(59,130,246,0.15)" : "none",
        transition: "all 0.2s ease",
      }}
    >
      {label}
    </button>
  );
}

const panel: React.CSSProperties = {
  background: "linear-gradient(160deg, #161b26 0%, #0c0f17 100%)",
  boxShadow: "0 20px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
  display: "flex",
  flexDirection: "column",
};
const header: React.CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(0,0,0,0.15)",
};
const input: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  color: "#f1f5f9",
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
  color: "#f87171",
  background: "rgba(239,68,68,0.1)",
  border: "1px solid rgba(239,68,68,0.25)",
  borderRadius: 8,
  padding: "10px 14px",
  fontFamily: "Inter, sans-serif",
};
const sectionGroup: React.CSSProperties = {
  background: "rgba(255,255,255,0.01)",
  border: "1px solid rgba(255,255,255,0.04)",
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
  color: "#3b82f6",
  letterSpacing: "0.06em",
  fontFamily: "Inter, sans-serif",
  borderBottom: "1px solid rgba(59,130,246,0.2)",
  paddingBottom: 4,
  marginBottom: 8,
};
const infoBannerB: React.CSSProperties = {
  background: "rgba(147,197,253,0.06)",
  border: "1px solid rgba(147,197,253,0.15)",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: "Inter, sans-serif",
};
const infoBannerD: React.CSSProperties = {
  background: "rgba(253,186,116,0.05)",
  border: "1px solid rgba(253,186,116,0.12)",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: "Inter, sans-serif",
};
