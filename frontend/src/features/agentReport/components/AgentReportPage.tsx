import { useEffect } from "react";
import { download } from "../../eval/exportBatch";
import { useToast } from "../../../shared/ui/Toast";
import { useEvalRegistryStore } from "../../eval/state/evalRegistryStore";
import { useReadinessStore } from "../state/readinessStore";
import { buildReadinessHtml } from "../reportHtml";
import { ProfileSelector } from "./ProfileSelector";
import { VerdictTable } from "./VerdictTable";

const exportBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#334155",
  cursor: "pointer",
};

const btn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
};

/// The Agent Readiness page: pick a target collection + a profile, run the
/// verdict over that collection's last persisted batch report, and read a
/// transparent Ready / Conditional / NotReady per model with its reasons.
export function AgentReportPage() {
  const { presets, collections, selected, select, init } = useEvalRegistryStore();
  const { profiles, selectedProfileId, verdicts, assessed, loading, error, loadProfiles, selectProfile, assess } =
    useReadinessStore();
  const toast = useToast();

  const onExport = () => {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile || verdicts.length === 0) return;
    const html = buildReadinessHtml(verdicts, profile, selected, new Date().toISOString());
    download(`readiness-${selected}.html`, html, "text/html");
    toast("Readiness report exported ✓");
  };

  useEffect(() => {
    if (presets.length === 0) void init().catch(() => {});
    void loadProfiles();
  }, [presets.length, init, loadProfiles]);

  const options = [...presets.map((p) => ({ id: p.id, label: p.label })), ...collections.map((c) => ({ id: c, label: c }))];

  return (
    <div data-testid="agent-report-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Local Agent Readiness Validator</h1>
        <p style={{ fontSize: 13, color: "#64748b" }}>
          Is this local model ready to replace your cloud agent? Every verdict is measured against your
          profile and carries the exact reasons — never a black-box score.
        </p>
      </header>

      <section style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <label style={{ fontSize: 13, color: "#334155" }}>
          Collection:{" "}
          <select
            data-testid="readiness-collection-select"
            value={selected}
            onChange={(e) => void select(e.target.value)}
            style={{ fontSize: 13, padding: "3px 6px", borderRadius: 6, border: "1px solid #cbd5e1" }}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <ProfileSelector profiles={profiles} selectedId={selectedProfileId} onSelect={selectProfile} />
        <button
          type="button"
          data-testid="readiness-run"
          style={btn}
          disabled={loading || !selectedProfileId}
          onClick={() => void assess(selected)}
        >
          {loading ? "Assessing…" : "▶ Run readiness"}
        </button>
      </section>

      {error && (
        <div data-testid="readiness-error" style={{ color: "#dc2626", fontSize: 13 }}>{error}</div>
      )}

      {assessed && verdicts.length === 0 && !error && (
        <div data-testid="readiness-empty" style={{ fontSize: 13, color: "#64748b" }}>
          No batch report found for “{selected}”. Run a batch for this collection on the Eval tab, then come
          back to assess it.
        </div>
      )}

      {verdicts.length > 0 && (
        <>
          <VerdictTable verdicts={verdicts} />
          <div>
            <button type="button" data-testid="readiness-export" style={exportBtn} onClick={onExport}>
              ⬇ Export shareable report (.HTML)
            </button>
          </div>
        </>
      )}

      {!assessed && !loading && (
        <div style={{ fontSize: 13, color: "#94a3b8" }}>
          Pick a target collection and a profile, then Run readiness.
        </div>
      )}
    </div>
  );
}
