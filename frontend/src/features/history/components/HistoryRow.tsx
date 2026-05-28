import type { HistoryEntry } from "../../../shared/ipc/history";

type Props = { entry: HistoryEntry; onRestore: (e: HistoryEntry) => void };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

export function HistoryRow({ entry, onRestore }: Props) {
  const title = entry.name || entry.user.slice(0, 80) || "(untitled)";
  return (
    <button
      type="button"
      onClick={() => onRestore(entry)}
      className="w-full text-left px-3 py-2 border-b hover:bg-gray-50"
      data-testid="history-row"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-800 truncate">{title}</span>
        <span className="text-[10px] text-gray-400 shrink-0">{when(entry.ran_at)}</span>
      </div>
      <p className="text-[10px] text-gray-500 truncate">
        {entry.model} · {entry.output_len} chars · {entry.token_count} tokens
      </p>
    </button>
  );
}
