import type { ModelVerdict, Tier } from "../../../shared/ipc/eval/readiness";
import type { HardwareTier } from "../../../shared/ipc/compare/hardware";
import { deriveTierCurve, tierRank } from "../tierCurve";

const cap = (t: Tier) => t.charAt(0).toUpperCase() + t.slice(1);
const up = (t: Tier) => t.toUpperCase();
const GIB = 1024 ** 3;

const STATUS = {
  ready: { label: "READY", icon: "🟢", cls: "bg-emerald-50/70 border-emerald-200 text-emerald-700" },
  conditional: { label: "CONDITIONAL", icon: "🟠", cls: "bg-amber-50/70 border-amber-200 text-amber-700" },
  not_ready: { label: "NOT READY", icon: "🔴", cls: "bg-rose-50/70 border-rose-200 text-rose-700" },
} as const;

/// Section 1 of the Agent Report deep-dive. The headline tier is the tier that ACTUALLY
/// ran (highest exercised in `by_tier`); the hardware class/recommendation is an advisory
/// lens, never a gate. Status = "did the model clear the tier it was tested at" — a
/// deliberate run-tier judgment, independent of the profile's `required_tier` (that
/// profile lens lives in the VerdictTable). See the curve helper for the precedence.
export function ExecutiveVerdict({
  verdict,
  hardwareTier,
  minPassK,
}: {
  verdict: ModelVerdict;
  hardwareTier: HardwareTier | null;
  minPassK: number;
}) {
  const { runTiers, tierTested, clearsThrough, clearedSet, status } = deriveTierCurve(verdict.by_tier, minPassK);

  // No agentic run → no tier framing (a single-turn-only collection, or nothing measured).
  if (tierTested === null) {
    return (
      <section data-testid="exec-verdict" className="border border-slate-200 rounded-xl shadow-md p-6 bg-white">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Executive Verdict</h3>
        <p data-testid="exec-verdict-empty" className="text-sm text-slate-500">
          No agentic tasks in this run — the tier verdict needs a Multi-Step collection.
        </p>
      </section>
    );
  }

  const clearedTier = verdict.verdict.cleared_tier ?? null;
  const hwRec = hardwareTier?.recommended_tier ?? null;
  const hwClass = hardwareTier ? `${hardwareTier.class} (${Math.round(hardwareTier.total_memory_bytes / GIB)}GB RAM)` : null;
  const belowRec = hwRec != null && tierRank(tierTested) < tierRank(hwRec);

  // Lens 1 branches on `clearedSet` emptiness FIRST — "nothing cleared" and the
  // non-monotonic case both have `clearsThrough === null` but must read differently.
  let lens1: string;
  if (clearedSet.size === 0) {
    lens1 = `Does not clear ${cap(runTiers[0].tier)}, the easiest tier tested.`;
  } else if (clearsThrough === null) {
    lens1 = `Cleared ${cap(clearedTier ?? tierTested)} but missed a lower tier — inconsistent; treat as not production-ready at ${cap(tierTested)}.`;
  } else if (clearsThrough === tierTested) {
    lens1 = `Clears every tier tested, through ${cap(tierTested)}.`;
  } else {
    lens1 = `Clears through ${cap(clearsThrough)}; falls off at ${cap(tierTested)} — the most demanding tier tested.`;
  }

  const s = STATUS[status];

  return (
    <section data-testid="exec-verdict" className="border border-slate-200 rounded-xl shadow-md p-6 bg-white space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Executive Verdict</h3>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        {hwClass && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-xs">Hardware Class:</span>
            <span data-testid="exec-verdict-hw" className="font-semibold text-slate-800">{hwClass}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-semibold uppercase tracking-wider text-xs">Tier Tested:</span>
          <span
            data-testid="exec-verdict-required-tier"
            className="font-mono font-bold text-slate-900 border border-slate-300 rounded px-2 py-0.5"
          >
            {up(tierTested)}
          </span>
          {hwRec && <span className="text-xs text-slate-400">(HW recommends {up(hwRec)})</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-semibold uppercase tracking-wider text-xs">Cleared Tier:</span>
          <span
            data-testid="exec-verdict-cleared-tier"
            className="font-mono font-bold text-slate-900 border border-slate-300 rounded px-2 py-0.5"
          >
            {clearedTier ? up(clearedTier) : "NONE"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span
          data-testid="exec-verdict-status"
          className={`inline-flex items-center gap-1.5 font-mono font-bold text-xs px-3 py-1 rounded-lg border ${s.cls}`}
        >
          {s.icon} {s.label}
        </span>
        <span data-testid="exec-verdict-lens1" className="text-sm text-slate-700">
          {lens1}
        </span>
      </div>

      {hwClass && (
        <p data-testid="exec-verdict-hw-lens" className="text-xs text-slate-500">
          HW: {hwClass} · recommends {up(hwRec as Tier)}.
        </p>
      )}

      {belowRec && (
        <p
          data-testid="exec-verdict-advisory"
          className="text-xs text-amber-700 bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2"
        >
          Tested at {cap(tierTested)}; your {hardwareTier!.class} hardware supports {cap(hwRec as Tier)} — run a harder
          tier for a production-grade verdict.
        </p>
      )}
    </section>
  );
}
