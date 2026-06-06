import type { Readiness } from "../../../shared/ipc/eval/readiness";

const CONFIG: Record<Readiness, { label: string; bg: string; text: string; border: string; dot: string }> = {
  ready: {
    label: "READY",
    bg: "bg-emerald-50/60",
    text: "text-emerald-700",
    border: "border-emerald-255/30",
    dot: "bg-emerald-500",
  },
  conditional: {
    label: "CONDITIONAL",
    bg: "bg-amber-50/60",
    text: "text-amber-700",
    border: "border-amber-255/35",
    dot: "bg-amber-500",
  },
  not_ready: {
    label: "NOT READY",
    bg: "bg-rose-50/60",
    text: "text-rose-700",
    border: "border-rose-255/30",
    dot: "bg-rose-500",
  },
};

export function StatusBadge({ status }: { status: Readiness }) {
  const c = CONFIG[status];
  return (
    <span
      data-testid={`readiness-badge-${status}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-[10px] font-bold tracking-wider leading-none shadow-sm/5 transition-all select-none ${c.bg} ${c.text} ${c.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} aria-hidden />
      {c.label}
    </span>
  );
}

