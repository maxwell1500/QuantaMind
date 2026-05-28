import { useEffect, useState } from "react";
import { getHardwareSnapshot } from "../../../shared/ipc/hardware";
import { formatIpcError } from "../../../shared/ipc/error";
import { formatBytes } from "../../../shared/format/bytes";
import { useCompareStore } from "../state/compareStore";
import { assessStrategies, type StrategyId, type Verdict } from "../state/strategy";

const STRATEGY_LABEL: Record<StrategyId, string> = {
  sequential: "Sequential",
  parallel: "Parallel",
};
const VERDICT_LABEL: Record<Verdict, string> = {
  ok: "OK",
  risky: "Risky",
  wont_fit: "Won't fit",
};
const VERDICT_CLASS: Record<Verdict, string> = {
  ok: "bg-green-100 text-green-800",
  risky: "bg-amber-100 text-amber-800",
  wont_fit: "bg-red-100 text-red-800",
};

export function HardwareSummary() {
  const selected = useCompareStore((s) => s.selectedModels);
  const snapshot = useCompareStore((s) => s.hardwareSnapshot);
  const setSnapshot = useCompareStore((s) => s.setHardwareSnapshot);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading"); setError(null);
    getHardwareSnapshot()
      .then((s) => { if (!cancelled) { setSnapshot(s); setStatus("ready"); } })
      .catch((e) => { if (!cancelled) { setError(formatIpcError(e)); setStatus("error"); } });
    return () => { cancelled = true; };
  }, [nonce, setSnapshot]);

  if (status === "loading")
    return <div className="text-xs text-gray-500" data-testid="hw-summary-loading">Reading hardware…</div>;
  if (status === "error" || !snapshot)
    return (
      <div role="alert" className="text-xs text-red-600" data-testid="hw-summary-error">
        {error ?? "Hardware snapshot unavailable"}{" "}
        <button type="button" onClick={() => setNonce((n) => n + 1)} className="underline">Retry</button>
      </div>
    );

  const matrix = assessStrategies(selected, snapshot);
  const memLabel = snapshot.is_apple_silicon ? "Unified memory" : "RAM";
  // Per-strategy verdicts only matter with 2+ models (sequential vs parallel
  // differ). For a single model, surface a warning only when it's tight —
  // a fitting model needs no badge.
  const showStrategies = !!matrix && selected.length >= 2;
  const singleWarn =
    matrix && selected.length === 1 && matrix.sequential.status !== "ok"
      ? matrix.sequential
      : null;
  return (
    <div data-testid="hw-summary" className="border rounded p-2 text-xs space-y-1">
      <div>
        {memLabel}: {formatBytes(snapshot.total_memory_bytes)} total · {formatBytes(snapshot.available_memory_bytes)} available
        <button type="button" onClick={() => setNonce((n) => n + 1)} className="ml-2 underline" data-testid="hw-refresh">Refresh</button>
      </div>
      {showStrategies && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STRATEGY_LABEL) as StrategyId[]).map((id) => {
            const v = matrix![id];
            return (
              <span key={id} data-testid={`verdict-${id}`} className={`px-2 py-0.5 rounded ${VERDICT_CLASS[v.status]}`}>
                {STRATEGY_LABEL[id]}: {VERDICT_LABEL[v.status]} · {formatBytes(v.required_bytes)}
              </span>
            );
          })}
        </div>
      )}
      {singleWarn && (
        <div data-testid="hw-single-warning" className={`inline-block px-2 py-0.5 rounded ${VERDICT_CLASS[singleWarn.status]}`}>
          Needs {formatBytes(singleWarn.required_bytes)} · {VERDICT_LABEL[singleWarn.status]} on this machine
        </div>
      )}
    </div>
  );
}
