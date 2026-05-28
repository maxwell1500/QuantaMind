import { useEffect, useState } from "react";
import { removeModel } from "../../../../shared/ipc/models/storage";
import { formatBytes } from "../../../../shared/format/bytes";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { useInstalledModelsStore } from "../../state/installedModelsStore";

export function DownloadsInstalled() {
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const storeError = useInstalledModelsStore((s) => s.error);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  const onDelete = async (name: string) => {
    setError(null);
    try {
      await removeModel(name);
      await refresh();
      setPending(null);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const showErr = error ?? storeError;

  if (list.length === 0) {
    return (
      <div className="text-xs text-gray-500" data-testid="downloads-empty-installed">
        No installed models yet. Browse the Ollama Library, Hugging Face,
        or Local File tabs to install one.
      </div>
    );
  }

  const pendingSize = pending
    ? list.find((m) => m.name === pending)?.size_bytes ?? 0
    : 0;

  return (
    <div className="flex flex-col gap-2" data-testid="downloads-installed-list">
      {showErr && <div role="alert" className="text-red-600 text-xs">{showErr}</div>}
      <ul className="divide-y border rounded">
        {list.map((m) => (
          <li
            key={m.name}
            data-testid={`download-installed-${m.name}`}
            className="px-3 py-2 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-sm truncate">{m.name}</div>
              <div className="text-[11px] text-gray-500">
                {m.family} · {m.parameter_size} · {m.quantization} · {formatBytes(m.size_bytes)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPending(m.name)}
              className="text-xs border rounded px-2 py-1"
              aria-label={`Delete ${m.name}`}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {pending && (
        <div
          role="alertdialog"
          data-testid="downloads-confirm-delete"
          className="border rounded p-3 bg-amber-50 text-xs"
        >
          Remove <strong>{pending}</strong>? This will free {formatBytes(pendingSize)}.
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => onDelete(pending)}
              className="border rounded px-2 py-1 bg-red-600 text-white"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="border rounded px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
