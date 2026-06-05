import type { ModelVerdict } from "../../../shared/ipc/eval/readiness";

/// The agentic-aware recommendation (Phase 7.3). The backend returns verdicts
/// ranked best-first (Ready > Conditional > NotReady, ties by effort then steps),
/// so `verdicts[0]` IS the pick — this banner just frames it honestly: a clear
/// recommendation when something is Ready, a caveated "best available" when only
/// Conditional, and a "no model is ready — closest" when nothing qualifies (never a
/// fabricated Ready).
export function RecommendationBanner({ verdicts, profileName }: { verdicts: ModelVerdict[]; profileName: string }) {
  const pick = verdicts[0];
  if (!pick) return null;

  const status = pick.verdict.status;
  const reason = pick.verdict.blocking[0] ?? pick.verdict.conditions[0] ?? null;

  const style =
    status === "ready"
      ? { bg: "#ecfdf5", border: "#a7f3d0", fg: "#065f46", icon: "🏆" }
      : status === "conditional"
        ? { bg: "#fffbeb", border: "#fde68a", fg: "#92400e", icon: "⚠️" }
        : { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b", icon: "🚫" };

  const headline =
    status === "ready"
      ? `Recommended for ${profileName} on your hardware:`
      : status === "conditional"
        ? `Best available for ${profileName} (with caveats):`
        : `No model is ready for ${profileName} — closest:`;

  const tail =
    status === "ready"
      ? reason
        ? ` — note: ${reason}`
        : " — meets every gate for this profile"
      : reason
        ? ` — ${reason}`
        : "";

  return (
    <div
      data-testid="recommendation-banner"
      data-status={status}
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 13,
        color: style.fg,
      }}
    >
      <span style={{ marginRight: 8 }}>{style.icon}</span>
      {headline} <b data-testid="recommendation-model">{pick.model}</b> ({statusLabel(status)}){tail}
    </div>
  );
}

function statusLabel(status: ModelVerdict["verdict"]["status"]): string {
  return status === "ready" ? "Ready" : status === "conditional" ? "Conditional" : "NotReady";
}
