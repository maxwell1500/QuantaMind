import type { CSSProperties } from "react";
import type { Readiness } from "../../../shared/ipc/eval/readiness";

/// Verdict pill — green Ready / amber Conditional / red NotReady. Colours match
/// the eval feature's pass/fail palette so the report reads consistently.
const STYLES: Record<Readiness, { label: string; icon: string; bg: string; border: string; color: string }> = {
  ready: { label: "READY", icon: "🟢", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.3)", color: "#16a34a" },
  conditional: { label: "CONDITIONAL", icon: "🟡", bg: "rgba(250,204,21,0.14)", border: "rgba(250,204,21,0.35)", color: "#b45309" },
  not_ready: { label: "NOT READY", icon: "🔴", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.28)", color: "#dc2626" },
};

export function StatusBadge({ status }: { status: Readiness }) {
  const s = STYLES[status];
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
    background: s.bg,
    border: `1px solid ${s.border}`,
    color: s.color,
  };
  return (
    <span data-testid={`readiness-badge-${status}`} style={style}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}
