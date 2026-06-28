import type { Tier, TierStat } from "../../../shared/ipc/eval/readiness";
import { PASS_K_BY_TIER } from "../../../shared/ipc/eval/readiness";
import { TIER_ORDER, tierPassRate, tierResult } from "../tierCurve";

const up = (t: Tier) => t.toUpperCase();
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const RESULT = {
  clear: { label: "CLEAR", cls: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "🟢" },
  saturated: { label: "SATURATED", cls: "bg-amber-50 border-amber-200 text-amber-700", dot: "🟠" },
  fail: { label: "FAIL", cls: "bg-rose-50 border-rose-200 text-rose-700", dot: "🔴" },
} as const;
// A tier absent from `by_tier` was never run — gray "NOT TESTED", never a guessed FAIL.
const NOT_TESTED = { label: "NOT TESTED", cls: "bg-slate-50 border-slate-200 text-slate-400", dot: "⚪" };

/// Per-tier "Task Parameters" sourced from the collection's real task axes (or `null` =
/// "not declared"). The mockup's fixed "3–8 steps / 2–4 decoys" ranges are NOT engine
/// policy, so they are never hardcoded here — the page derives these from the tasks.
export interface TierCardParams {
  horizon: string | null;
  decoys: string | null;
}

/// Section 2: the saturation curve as four tier cards (Easy→Extreme). Measured Pass^k +
/// avg-steps come from `by_tier`; the result badge uses the same `min_pass_k` bar as the
/// Executive Verdict's cleared set, so the two sections never contradict.
export function TierProgressionMatrix({
  byTier,
  minPassK,
  params,
  selectedTier,
  onSelectTier,
}: {
  byTier: TierStat[] | undefined;
  minPassK: number;
  params?: Partial<Record<Tier, TierCardParams>>;
  /// The tier whose failures the deep-dive is showing, or null. Clicking a TESTED
  /// card selects it (and reveals its failure taxonomy); clicking it again clears.
  selectedTier: Tier | null;
  onSelectTier: (t: Tier | null) => void;
}) {
  const statByTier = new Map((byTier ?? []).map((s) => [s.tier, s]));
  return (
    <section data-testid="tier-matrix" className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
        Tier Progression Matrix (Saturation Curve)
        <span className="text-slate-400 font-medium normal-case"> — click a tested tier for its failures</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TIER_ORDER.map((tier) => {
          const s = statByTier.get(tier);
          const k = PASS_K_BY_TIER[tier];
          const p = params?.[tier];
          const res = s ? RESULT[tierResult(s, minPassK)] : NOT_TESTED;
          const tested = !!s;
          const selected = selectedTier === tier;
          return (
            <div
              key={tier}
              data-testid={`tier-card-${tier}`}
              role={tested ? "button" : undefined}
              tabIndex={tested ? 0 : undefined}
              aria-pressed={tested ? selected : undefined}
              onClick={tested ? () => onSelectTier(selected ? null : tier) : undefined}
              onKeyDown={
                tested
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectTier(selected ? null : tier);
                      }
                    }
                  : undefined
              }
              className={`rounded-xl shadow-sm p-4 bg-white space-y-3 border ${
                tested ? "cursor-pointer hover:border-slate-300" : "border-slate-200"
              } ${selected ? "border-slate-800 ring-2 ring-slate-800/20" : tested ? "border-slate-200" : ""}`}
            >
              <span className="font-mono font-bold text-xs text-slate-800">
                {res.dot} TIER: {up(tier)}
              </span>

              <div className="text-xs text-slate-500 space-y-0.5">
                <div className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">Task Parameters</div>
                <div data-testid={`tier-horizon-${tier}`}>
                  Horizon: <span className="text-slate-700">{p?.horizon ?? "not declared"}</span>
                </div>
                <div data-testid={`tier-decoys-${tier}`}>
                  Decoy Tools: <span className="text-slate-700">{p?.decoys ?? "not declared"}</span>
                </div>
              </div>

              <div className="text-xs text-slate-500 space-y-0.5 border-t border-slate-100 pt-2">
                <div className="font-semibold uppercase tracking-wider text-[10px] text-slate-400">Metrics</div>
                <div data-testid={`tier-passk-${tier}`}>
                  Pass^{k} Rate: <span className="font-mono font-bold text-slate-800">{s ? pct(tierPassRate(s)) : "—"}</span>
                </div>
                <div data-testid={`tier-steps-${tier}`}>
                  Avg Steps: <span className="font-mono text-slate-700">{s?.avg_steps != null ? s.avg_steps.toFixed(1) : "—"}</span>
                </div>
              </div>

              <span
                data-testid={`tier-result-${tier}`}
                className={`inline-flex items-center font-mono font-bold text-xs px-2.5 py-1 rounded-lg border ${res.cls}`}
              >
                {res.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
