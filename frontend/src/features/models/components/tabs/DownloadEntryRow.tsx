import type { DownloadEntry } from "../../state/modelStore";
import { formatBytes } from "../../../../shared/format/bytes";

type Props = {
  entry: DownloadEntry;
  onCancel: () => void;
  onDismiss: () => void;
};

const STYLE_BY_STATUS: Record<string, string> = {
  success: "border-green-300 bg-green-50",
  error: "border-red-300 bg-red-50",
};

const LABEL_BY_STATUS: Record<string, string> = {
  success: "Installed ✓",
  error: "Failed",
};

export function DownloadEntryRow({ entry, onCancel, onDismiss }: Props) {
  const d = entry;
  const terminal = d.status === "success" || d.status === "error";
  const cls = STYLE_BY_STATUS[d.status] ?? "";
  const statusLabel = LABEL_BY_STATUS[d.status] ?? d.status;
  return (
    <li
      data-testid={`download-active-${d.id}`}
      className={`flex items-center gap-2 border rounded px-3 py-2 ${cls}`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{d.name}</div>
        <div className="text-[11px] text-gray-500">
          {d.source} · {statusLabel}
          {d.bytesTotal
            ? ` · ${formatBytes(d.bytesCompleted ?? 0)} / ${formatBytes(d.bytesTotal)}`
            : ""}
        </div>
        {!terminal && (
          <div className="flex items-center gap-2 mt-1">
            <progress value={d.percent} max={100} className="flex-1 h-2" />
            <span className="text-xs tabular-nums w-10 text-right">{d.percent}%</span>
          </div>
        )}
        {d.status === "error" && d.error && (
          <div
            className="text-xs text-red-600 mt-1"
            data-testid={`download-error-${d.id}`}
          >
            {d.error}
          </div>
        )}
      </div>
      {terminal ? (
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs border rounded px-2 py-1"
          aria-label={`Dismiss ${d.name}`}
        >
          Dismiss
        </button>
      ) : d.source !== "local" ? (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs border rounded px-2 py-1"
          aria-label={`Cancel ${d.name}`}
        >
          Cancel
        </button>
      ) : null}
    </li>
  );
}
