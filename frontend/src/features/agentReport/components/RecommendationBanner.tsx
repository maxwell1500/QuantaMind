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

  const config =
    status === "ready"
      ? {
          bg: "bg-emerald-50/45 border-emerald-200/80 text-emerald-900 border-l-emerald-500",
          icon: (
            <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v5m-3 0h6M4 11a7 7 0 007 7v-3a4 4 0 01-4-4H4zm16 0a7 7 0 01-7 7v-3a4 4 0 004-4h3zM12 4a3 3 0 013 3v4a3 3 0 01-6 0V7a3 3 0 013-3z" />
            </svg>
          ),
        }
      : status === "conditional"
        ? {
            bg: "bg-amber-50/45 border-amber-200/80 text-amber-900 border-l-amber-500",
            icon: (
              <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ),
          }
        : {
            bg: "bg-rose-50/45 border-rose-200/80 text-rose-900 border-l-rose-500",
            icon: (
              <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ),
          };

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
      className={`flex items-start gap-3 border border-l-4 rounded-xl p-4 text-sm shadow-sm transition-all duration-300 ${config.bg}`}
    >
      {config.icon}
      <div className="leading-relaxed">
        <span className="font-medium">{headline}</span>{" "}
        <strong data-testid="recommendation-model" className="font-bold underline decoration-dotted underline-offset-4 decoration-2">
          {pick.model}
        </strong>{" "}
        <span className="font-semibold">({statusLabel(status)})</span>
        <span>{tail}</span>
      </div>
    </div>
  );
}

function statusLabel(status: ModelVerdict["verdict"]["status"]): string {
  return status === "ready" ? "Ready" : status === "conditional" ? "Conditional" : "NotReady";
}

