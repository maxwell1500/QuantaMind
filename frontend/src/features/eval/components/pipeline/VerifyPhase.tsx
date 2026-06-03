import type { Verdict } from "../../../../shared/ipc/eval/toolcall";

const PASS = "#4ade80";
const FAIL = "#f87171";

/// Phase 4 — Verify: the Evaluation Engine Report. Maps the structural verdict to
/// named checks with a success %. Abstain tasks show a single abstention check.
export function VerifyPhase({ verdict, category }: { verdict: Verdict; category: string }) {
  const checks =
    category === "abstain"
      ? [{ label: "Correct Abstention", ok: verdict.abstain_correct === true }]
      : [
          { label: "JSON Regex Extraction", ok: verdict.parsed },
          { label: "Tool Name Key Match", ok: verdict.tool_match },
          { label: "Parameter Type Validation", ok: verdict.args_match },
        ];
  const passed = checks.filter((c) => c.ok).length;
  const pct = Math.round((passed / checks.length) * 100);
  const allOk = passed === checks.length;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: 20,
      }}
      data-testid="pipeline-verify"
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter,sans-serif", textAlign: "center", marginBottom: 16 }}>
        Evaluation Engine Report
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 340, margin: "0 auto" }}>
        {checks.map((c) => (
          <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                background: c.ok ? PASS : FAIL, color: "#0b0f17",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
              }}
            >
              {c.ok ? "✓" : "✗"}
            </span>
            <span style={{ fontSize: 13, color: "#cbd5e1", fontFamily: "Inter,sans-serif" }}>{c.label}</span>
          </div>
        ))}
      </div>
      <div
        style={{ marginTop: 18, textAlign: "center", fontSize: 20, fontWeight: 700, color: allOk ? PASS : FAIL, fontFamily: "Inter,sans-serif" }}
        data-testid="pipeline-verify-success"
      >
        {allOk ? "✓ " : ""}{pct}% SUCCESS
      </div>
    </div>
  );
}
