import { useEffect, useState } from "react";
import { removeModel } from "../../../../shared/ipc/models/storage";
import { formatBytes } from "../../../../shared/format/bytes";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { useInstalledModelsStore } from "../../state/installedModelsStore";
import { groupInstalled } from "../../state/installedGroups";
import { ConfirmRemove } from "../ConfirmRemove";
import { AddToOllamaButton } from "./AddToOllamaButton";

const badge = "text-[10px] px-1 py-0.5 rounded";

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

  const onDelete = async (ollamaName: string) => {
    setError(null);
    try {
      await removeModel(ollamaName);
      await refresh();
      setPending(null);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  const showErr = error ?? storeError;
  const groups = groupInstalled(list);
  if (groups.length === 0) {
    return (
      <div className="text-xs text-gray-500" data-testid="downloads-empty-installed">
        No installed models yet. Browse the Ollama Library, Hugging Face, or Local File tabs.
      </div>
    );
  }
  const pendingSize = pending ? groups.find((g) => g.ollamaName === pending)?.sizeBytes ?? 0 : 0;

  return (
    <div className="flex flex-col gap-2" data-testid="downloads-installed-list">
      {showErr && <div role="alert" className="text-red-600 text-xs">{showErr}</div>}
      <ul className="divide-y border rounded">
        {groups.map((g) => (
          <li key={g.name} data-testid={`download-installed-${g.name}`}
            className="px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm truncate flex items-center gap-1">
                {g.name}
                {g.ollamaName && <span className={`${badge} bg-blue-50 text-blue-700`}>Ollama</span>}
                {g.llamaPath && <span className={`${badge} bg-amber-50 text-amber-700`}>llama.cpp</span>}
              </div>
              <div className="text-[11px] text-gray-500">
                {g.family} · {g.parameterSize} · {g.quantization} · {formatBytes(g.sizeBytes)}
              </div>
            </div>
            {g.llamaPath && !g.ollamaName && <AddToOllamaButton path={g.llamaPath} name={g.name} />}
            {g.ollamaName && (
              <button type="button" onClick={() => setPending(g.ollamaName!)}
                className="text-xs border rounded px-2 py-1" aria-label={`Delete ${g.name}`}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {pending && (
        <ConfirmRemove name={pending} sizeBytes={pendingSize}
          onConfirm={() => void onDelete(pending)} onCancel={() => setPending(null)} />
      )}
    </div>
  );
}
