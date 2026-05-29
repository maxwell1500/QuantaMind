import { useEffect, useState } from "react";
import { removeModel } from "../../../../shared/ipc/models/storage";
import { formatBytes } from "../../../../shared/format/bytes";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { useInstalledModelsStore } from "../../state/installedModelsStore";
import { ConfirmRemove } from "../ConfirmRemove";
import { AddToOllamaButton } from "./AddToOllamaButton";

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
        No installed models yet. Browse the Ollama Library, Hugging Face, or Local File tabs.
      </div>
    );
  }

  const inOllama = new Set(list.filter((m) => m.backend === "ollama").map((m) => m.name));
  const pendingSize = pending ? list.find((m) => m.name === pending)?.size_bytes ?? 0 : 0;

  return (
    <div className="flex flex-col gap-2" data-testid="downloads-installed-list">
      {showErr && <div role="alert" className="text-red-600 text-xs">{showErr}</div>}
      <ul className="divide-y border rounded">
        {list.map((m) => (
          <li
            key={`${m.backend}:${m.name}`}
            data-testid={`download-installed-${m.backend}-${m.name}`}
            className="px-3 py-2 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-sm truncate">
                {m.name}{" "}
                <span className="text-[10px] text-gray-400">
                  · {m.backend === "llama_cpp" ? "llama.cpp" : "Ollama"}
                </span>
              </div>
              <div className="text-[11px] text-gray-500">
                {m.family} · {m.parameter_size} · {m.quantization} · {formatBytes(m.size_bytes)}
              </div>
            </div>
            {m.backend === "llama_cpp" && m.path && !inOllama.has(m.name) && (
              <AddToOllamaButton path={m.path} name={m.name} />
            )}
            {m.backend === "ollama" && (
              <button
                type="button"
                onClick={() => setPending(m.name)}
                className="text-xs border rounded px-2 py-1"
                aria-label={`Delete ${m.name}`}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {pending && (
        <ConfirmRemove
          name={pending}
          sizeBytes={pendingSize}
          onConfirm={() => void onDelete(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
