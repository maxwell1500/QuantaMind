import { invoke } from "@tauri-apps/api/core";
import { cancelHfInstall } from "../../../../shared/ipc/hf_install";
import {
  useModelStore,
  type DownloadEntry,
} from "../../state/modelStore";
import { formatBytes } from "../../format";

const ACTIVE_STATUSES = new Set(["downloading", "installing"]);

async function cancelEntry(entry: DownloadEntry) {
  if (entry.source === "huggingface") {
    try { await cancelHfInstall(); } catch { /* best-effort */ }
    return;
  }
  if (entry.source === "ollama" && entry.pullId) {
    try { await invoke("cancel_pull", { pullId: entry.pullId }); } catch { /* best-effort */ }
  }
}

export function DownloadsActive() {
  const downloads = useModelStore((s) => s.downloads);
  const removeDownload = useModelStore((s) => s.removeDownload);
  const active = Object.values(downloads).filter((d) =>
    ACTIVE_STATUSES.has(d.status),
  );

  if (active.length === 0) {
    return (
      <div className="text-xs text-gray-500" data-testid="downloads-empty-active">
        No active downloads.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="downloads-active-list">
      {active.map((d) => (
        <li
          key={d.id}
          data-testid={`download-active-${d.id}`}
          className="flex items-center gap-2 border rounded px-3 py-2"
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{d.name}</div>
            <div className="text-[11px] text-gray-500">
              {d.source} · {d.status}
              {d.bytesTotal ? ` · ${formatBytes(d.bytesCompleted ?? 0)} / ${formatBytes(d.bytesTotal)}` : ""}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <progress value={d.percent} max={100} className="flex-1 h-2" />
              <span className="text-xs tabular-nums w-10 text-right">{d.percent}%</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void cancelEntry(d); removeDownload(d.id); }}
            className="text-xs border rounded px-2 py-1"
            aria-label={`Cancel ${d.name}`}
          >
            Cancel
          </button>
        </li>
      ))}
    </ul>
  );
}
