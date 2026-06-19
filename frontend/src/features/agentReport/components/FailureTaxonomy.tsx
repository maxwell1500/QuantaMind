import type { Tier, TierStat } from "../../../shared/ipc/eval/readiness";
import type { FailureTracker } from "../../../shared/ipc/eval/batch";

const cap = (t: Tier) => t.charAt(0).toUpperCase() + t.slice(1);

/// The tracked failure modes → human label + the vulnerability each exposes. Static
/// documentation (matches the mockup); the counts are measured.
const FAILURE_MODES: { key: keyof FailureTracker; label: string; vuln: string }[] = [
  { key: "unknown_tool_calls", label: "UnknownTool", vuln: "Fell for decoy tools injected into the context." },
  { key: "forbidden_calls", label: "ForbiddenCall", vuln: "Violated 'must_not_call' rules on decision boundaries." },
  { key: "infinite_loop_hits", label: "InfiniteLoop", vuln: "Failed to resolve hidden prerequisites; repeated actions." },
  { key: "hallucinated_completions", label: "Hallucinated", vuln: "Claimed done / called methods outside the schema." },
  { key: "malformed_json_calls", label: "MalformedJson", vuln: "Emitted broken JSON in a tool call." },
  { key: "schema_unrecovered_calls", label: "SchemaError", vuln: "Exhausted the schema-recovery budget on invalid calls." },
  { key: "turn_timeouts", label: "TurnTimeout", vuln: "Exceeded the per-step wall-clock budget (wedged)." },
];

const ZERO: FailureTracker = {
  infinite_loop_hits: 0,
  hallucinated_completions: 0,
  malformed_json_calls: 0,
  schema_unrecovered_calls: 0,
  unknown_tool_calls: 0,
  forbidden_calls: 0,
  turn_timeouts: 0,
};

function sumFailures(list: FailureTracker[]): FailureTracker {
  return list.reduce((acc, f) => {
    (Object.keys(acc) as (keyof FailureTracker)[]).forEach((k) => (acc[k] += f[k] ?? 0));
    return acc;
  }, { ...ZERO });
}

/// Section 3: the distribution of failure MODES across the tiers that actually ran (not a
/// hardcoded Hard+Extreme — a Mainstream Easy/Medium run gets a truthful section too). The
/// denominator is total tracked failure *events*, not failed runs — labeled as such.
export function FailureTaxonomy({ byTier }: { byTier: TierStat[] | undefined }) {
  const tiers = byTier ?? [];
  const total = sumFailures(tiers.map((s) => s.failures));
  const rows = FAILURE_MODES.map((m) => ({ ...m, count: total[m.key] ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const grand = rows.reduce((n, r) => n + r.count, 0);
  const tierLabel = tiers.map((s) => cap(s.tier)).join(" + ");

  return (
    <section data-testid="failure-taxonomy" className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
        Failure Taxonomy{tierLabel && <span className="text-slate-400 font-medium normal-case"> — across {tierLabel}</span>}
      </h3>

      {grand === 0 ? (
        <p data-testid="failure-taxonomy-empty" className="text-sm text-slate-500">
          No failures recorded across the tested tiers.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-slate-400">Share of {grand} tracked failure events (not 1:1 with failed runs).</p>
          <div className="border border-slate-200 rounded-xl shadow-md p-5 bg-white space-y-4">
            {rows.map((r) => {
              const share = Math.round((r.count / grand) * 100);
              return (
                <div key={r.key} data-testid={`failure-row-${r.key}`} className="space-y-1">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="font-mono font-bold text-slate-800 w-12 text-right">{share}%</span>
                    <div className="flex-1 h-3 bg-slate-100 rounded">
                      <div className="h-3 bg-rose-400/80 rounded" style={{ width: `${share}%` }} />
                    </div>
                    <span className="font-semibold text-slate-800 w-28">{r.label}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 pl-[3.75rem]">{r.vuln}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
