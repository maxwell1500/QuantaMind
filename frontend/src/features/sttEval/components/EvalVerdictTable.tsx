import type { SttModelVerdict } from "../../../shared/ipc/stt/eval";

const pct = (x: number | null | undefined) => (x == null ? "N/A" : `${(x * 100).toFixed(0)}%`);

const STATUS: Record<string, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "bg-green-50 text-green-700" },
  conditional: { label: "Conditional", cls: "bg-amber-50 text-amber-700" },
  not_ready: { label: "Not ready", cls: "bg-red-50 text-red-700" },
};

/// Per-model readiness verdict, ranked best-first by the backend. The gated
/// figure is the weighted WER; blocking/conditions explain the status verbatim.
export function EvalVerdictTable({ verdicts }: { verdicts: SttModelVerdict[] }) {
  if (verdicts.length === 0) {
    return <p className="text-xs text-gray-500" data-testid="stt-eval-verdict-empty">No verdict yet. Assess against a profile.</p>;
  }
  return (
    <div className="flex flex-col gap-2" data-testid="stt-eval-verdicts">
      {verdicts.map((v) => {
        const s = STATUS[v.verdict.status] ?? { label: v.verdict.status, cls: "bg-gray-100" };
        return (
          <div key={v.model} data-testid={`stt-verdict-${v.model}`} className="border rounded p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono truncate">{v.model}</span>
              <span className={`text-[11px] px-1.5 py-0.5 rounded ${s.cls}`} data-testid={`stt-verdict-status-${v.model}`}>
                {s.label}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 font-mono">
              weighted WER {pct(v.weighted_wer)} · raw {pct(v.wer)} · RTF {v.rtf == null ? "N/A" : `${v.rtf.toFixed(2)}×`}
            </div>
            {v.verdict.blocking.length > 0 && (
              <ul className="mt-1 text-red-600 list-disc list-inside">
                {v.verdict.blocking.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            {v.verdict.conditions.length > 0 && (
              <ul className="mt-1 text-amber-700 list-disc list-inside">
                {v.verdict.conditions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
