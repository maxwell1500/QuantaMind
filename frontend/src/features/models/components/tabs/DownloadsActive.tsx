import { useEffect, useMemo, useState } from "react";
import { useModelStore, type DownloadEntry } from "../../state/modelStore";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { cancelEntry } from "./cancelEntry";
import { DownloadEntryRow } from "./DownloadEntryRow";

const VISIBLE = new Set(["downloading", "installing", "success", "error"]);
const AUTO_CLEAR_MS = 5000;

export function DownloadsActive() {
  const downloads = useModelStore((s) => s.downloads);
  const removeDownload = useModelStore((s) => s.removeDownload);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const visible = useMemo(
    () => Object.values(downloads).filter((d) => VISIBLE.has(d.status)),
    [downloads],
  );
  const successKey = visible
    .filter((d) => d.status === "success")
    .map((d) => d.id)
    .join("\n");

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Auto-clear success entries so completed installs don't accumulate
  // in the "In progress" section indefinitely. Errors are kept until
  // the user dismisses them explicitly.
  useEffect(() => {
    if (!successKey) return;
    const ids = successKey.split("\n");
    const timers = ids.map((id) =>
      setTimeout(() => removeDownload(id), AUTO_CLEAR_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [successKey, removeDownload]);

  const onCancel = async (d: DownloadEntry) => {
    setCancelError(null);
    setToast(null);
    const err = await cancelEntry(d);
    if (err) {
      setCancelError(`Cancel for ${d.name} failed: ${formatIpcError(err)}`);
      return;
    }
    removeDownload(d.id);
    setToast(`Cancelled ${d.name} — partial files cleaned.`);
  };

  if (visible.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {toast && (
          <div role="status" data-testid="cancel-toast" className="text-green-700 text-xs">
            {toast}
          </div>
        )}
        <div className="text-xs text-gray-500" data-testid="downloads-empty-active">
          No active downloads.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {cancelError && (
        <div role="alert" data-testid="cancel-error" className="text-red-600 text-xs">
          {cancelError}
        </div>
      )}
      {toast && (
        <div role="status" data-testid="cancel-toast" className="text-green-700 text-xs">
          {toast}
        </div>
      )}
      <ul className="flex flex-col gap-2" data-testid="downloads-active-list">
        {visible.map((d) => (
          <DownloadEntryRow
            key={d.id}
            entry={d}
            onCancel={() => onCancel(d)}
            onDismiss={() => removeDownload(d.id)}
          />
        ))}
      </ul>
    </div>
  );
}
