import type { SttReportRow } from "../../../shared/ipc/stt/eval";

const pct = (x: number | null | undefined) => (x == null ? "N/A" : `${(x * 100).toFixed(0)}%`);
const num = (x: number | null | undefined, suffix = "") => (x == null ? "N/A" : `${x.toFixed(2)}${suffix}`);

/// One scored row per (model, task). Every cell maps a missing metric to "N/A"
/// — a task with no reference shows WER columns as N/A (accuracy unverified),
/// never a fabricated number.
export function EvalReportTable({ rows }: { rows: SttReportRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-gray-500" data-testid="stt-eval-report-empty">No scored rows. Run an eval.</p>;
  }
  return (
    <table className="text-xs w-full" data-testid="stt-eval-report">
      <thead className="text-gray-500 text-left">
        <tr>
          <th className="py-1">Task</th>
          <th>Model</th>
          <th>RTF</th>
          <th>WER</th>
          <th>Weighted</th>
          <th>Crit-acc</th>
          <th>Repeat</th>
          <th>Silence</th>
          <th>Conf</th>
          <th>Misreads</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {rows.map((r) => (
          <tr key={`${r.model}-${r.task_id}`} data-testid={`stt-eval-row-${r.task_id}`} className="border-t border-gray-100">
            <td className="py-1">{r.task_id}</td>
            <td className="truncate max-w-[140px]">{r.model}</td>
            <td>{num(r.rtf, "×")}</td>
            <td data-testid={`wer-${r.task_id}`}>{r.wer == null ? "N/A" : pct(r.wer.wer)}</td>
            <td>{r.wer == null ? "N/A" : pct(r.wer.weighted_wer)}</td>
            <td>{r.wer == null ? "N/A" : pct(r.wer.critical_token_accuracy)}</td>
            <td>{pct(r.repeat_rate)}</td>
            <td>{pct(r.silence_rate)}</td>
            <td>{pct(r.confidence)}</td>
            <td data-testid={`misreads-${r.task_id}`}>
              {r.wer && r.wer.misreads.length > 0
                ? r.wer.misreads.map((m) => `${m.reference}→${m.heard}`).join(", ")
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
