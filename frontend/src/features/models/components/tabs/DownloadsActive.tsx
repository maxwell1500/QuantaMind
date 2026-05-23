import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { cancelHfInstall } from "../../../../shared/ipc/hf_install";
import {
  useModelStore,
  type DownloadEntry,
} from "../../state/modelStore";
import { formatBytes } from "../../format";
import { formatIpcError } from "../../../../shared/ipc/error";

const ACTIVE_STATUSES = new Set(["downloading", "installing"]);

async function cancelEntry(entry: DownloadEntry): Promise<Error | null> {
  try {
    if (entry.source === "huggingface") {
      await cancelHfInstall();
    } else if (entry.source === "ollama" && entry.pullId) {
      await invoke("cancel_pull", { pullId: entry.pullId });
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

export function DownloadsActive() {
  const downloads = useModelStore((s) => s.downloads);
  const removeDownload = useModelStore((s) => s.removeDownload);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const active = Object.values(downloads).filter((d) =>
    ACTIVE_STATUSES.has(d.status),
  );

  const onCancelClick = async (d: DownloadEntry) => {
    setCancelError(null);
    const err = await cancelEntry(d);
    if (err) {
      setCancelError(`Cancel for ${d.name} failed: ${formatIpcError(err)}`);
      return;
    }
    removeDownload(d.id);
  };

  if (active.length === 0) {
    return (
      <div className="text-xs text-gray-500" data-testid="downloads-empty-active">
        No active downloads.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {cancelError && (
        <div role="alert" data-testid="cancel-error" className="text-red-600 text-xs">{cancelError}</div>
      )}
      <ul className="flex flex-col gap-2" data-testid="downloads-active-list">
        {active.map((d) => (
          <li key={d.id} data-testid={`download-active-${d.id}`}
            className="flex items-center gap-2 border rounded px-3 py-2">
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
            {d.source !== "local" && (
              <button type="button" onClick={() => void onCancelClick(d)}
                className="text-xs border rounded px-2 py-1"
                aria-label={`Cancel ${d.name}`}>
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
