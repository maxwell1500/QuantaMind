import type { Readiness } from "../../../shared/ipc/eval/readiness";

export function StatusBadge({ status }: { status: Readiness }) {
  if (status === "ready") {
    return (
      <span
        data-testid="readiness-badge-ready"
        className="inline-flex items-center font-mono font-bold text-emerald-700 bg-emerald-50/70 border border-emerald-200 px-3 py-1 rounded-md text-xs select-none shadow-sm"
      >
        [ 🟢 READY ]
        <span className="hidden">READY</span>
      </span>
    );
  }
  if (status === "not_ready") {
    return (
      <span
        data-testid="readiness-badge-not_ready"
        className="inline-flex items-center font-mono font-bold text-rose-700 bg-rose-50/70 border border-rose-200 px-3 py-1 rounded-md text-xs select-none shadow-sm"
      >
        [ 🔴 FAIL ]
        <span className="hidden">NOT READY</span>
      </span>
    );
  }
  // status === "conditional"
  return (
    <span
      data-testid="readiness-badge-conditional"
      className="inline-flex items-center font-mono font-bold text-amber-700 bg-amber-50/70 border border-amber-200 px-3 py-1 rounded-md text-xs select-none shadow-sm"
    >
      [ 🟡 WARN ]
      <span className="hidden">CONDITIONAL</span>
    </span>
  );
}
