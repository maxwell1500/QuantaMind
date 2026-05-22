import { useEffect, useState } from "react";
import {
  getDiskUsage,
  getInstalledModelsWithStats,
  removeModel,
  type DiskUsage,
  type InstalledModelInfo,
} from "../../../../shared/ipc/storage";
import { formatBytes } from "../../format";

export function StorageTab() {
  const [models, setModels] = useState<InstalledModelInfo[]>([]);
  const [usage, setUsage] = useState<DiskUsage | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [ms, du] = await Promise.all([
        getInstalledModelsWithStats(),
        getDiskUsage(),
      ]);
      setModels(ms);
      setUsage(du);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void refresh(); }, []);

  const confirmDelete = async (name: string) => {
    try {
      await removeModel(name);
      setConfirmRemove(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const confirmingSize = models.find((m) => m.name === confirmRemove)?.size_bytes ?? 0;

  return (
    <div data-testid="storage-tab" className="flex flex-col gap-3 h-full">
      {usage && (
        <div className="text-xs text-gray-600" data-testid="disk-summary">
          Models: {formatBytes(usage.ollama_models_bytes)} / Free:{" "}
          {formatBytes(usage.free_bytes)} on disk
        </div>
      )}
      {error && <div role="alert" className="text-red-600 text-xs">{error}</div>}
      <ul className="flex-1 overflow-auto divide-y" data-testid="installed-list">
        {models.length === 0 && (
          <li className="text-xs text-gray-500 py-2">No models installed.</li>
        )}
        {models.map((m) => (
          <li
            key={m.name}
            className="py-2 flex items-center justify-between gap-2"
            data-testid={`installed-${m.name}`}
          >
            <div className="flex flex-col">
              <span className="text-sm">{m.name}</span>
              <span className="text-xs text-gray-500">
                {m.family} · {m.parameter_size} · {m.quantization} · {formatBytes(m.size_bytes)}
              </span>
            </div>
            <button type="button" onClick={() => setConfirmRemove(m.name)} className="text-xs border rounded px-2 py-1">
              Uninstall
            </button>
          </li>
        ))}
      </ul>
      {confirmRemove && (
        <div role="alertdialog" aria-labelledby="confirm-uninstall-title" data-testid="confirm-dialog" className="border rounded p-3 bg-amber-50">
          <p id="confirm-uninstall-title" className="text-sm">
            Remove <strong>{confirmRemove}</strong>? This will free {formatBytes(confirmingSize)}.
          </p>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => confirmDelete(confirmRemove)} className="text-xs border rounded px-2 py-1 bg-red-600 text-white">
              Remove
            </button>
            <button type="button" onClick={() => setConfirmRemove(null)} className="text-xs border rounded px-2 py-1">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
