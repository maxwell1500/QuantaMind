import type { CompareRow, RowStatus } from "../state/compareStore";

type Props = { row: CompareRow };

const STATUS_LABEL: Record<RowStatus, string> = {
  pending: "Waiting",
  running: "Running",
  done: "Done",
  cancelled: "Cancelled",
  error: "Error",
};
const STATUS_CLASS: Record<RowStatus, string> = {
  pending: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-800",
  done: "bg-green-100 text-green-800",
  cancelled: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
};

const formatMetrics = (m: NonNullable<CompareRow["metrics"]>): string => {
  const ttft = m.ttft_ms != null ? `TTFT ${m.ttft_ms}ms` : null;
  const tps = m.tokens_per_sec != null ? `${m.tokens_per_sec.toFixed(1)} tok/s` : null;
  const tokens = `${m.token_count} tokens`;
  return [ttft, tps, tokens].filter(Boolean).join(" · ");
};

export function CompareColumn({ row }: Props) {
  return (
    <div
      data-testid={`compare-column-${row.model}`}
      className="border rounded p-2 flex flex-col gap-1 min-w-[260px] max-w-[420px]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium break-all">{row.model}</span>
        <span data-testid={`compare-status-${row.model}`} className={`text-xs px-2 py-0.5 rounded ${STATUS_CLASS[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>
      </div>
      <pre
        data-testid={`compare-output-${row.model}`}
        className="text-xs whitespace-pre-wrap break-words font-mono bg-gray-50 rounded p-2 min-h-[80px] max-h-[280px] overflow-auto"
      >
        {row.output || (row.status === "pending" ? "" : " ")}
      </pre>
      {row.metrics && row.status === "done" && (
        <div className="text-xs text-gray-600" data-testid={`compare-metrics-${row.model}`}>
          {formatMetrics(row.metrics)}
        </div>
      )}
      {row.error && (
        <div role="alert" data-testid={`compare-error-${row.model}`} className="text-xs text-red-600">
          {row.error.kind}: {row.error.message}
        </div>
      )}
    </div>
  );
}
