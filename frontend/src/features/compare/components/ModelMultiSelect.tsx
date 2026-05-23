import { useEffect, useState } from "react";
import {
  getInstalledModelsWithStats,
  type InstalledModelInfo,
} from "../../../shared/ipc/storage";
import { formatIpcError } from "../../../shared/ipc/error";
import { formatBytes } from "../../../shared/format/bytes";
import { useCompareStore } from "../state/compareStore";

type Status = "loading" | "ready" | "error";

export function ModelMultiSelect() {
  const selected = useCompareStore((s) => s.selectedModels);
  const setSelected = useCompareStore((s) => s.setSelectedModels);
  const [available, setAvailable] = useState<InstalledModelInfo[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading"); setError(null);
    getInstalledModelsWithStats()
      .then((list) => { if (!cancelled) { setAvailable(list); setStatus("ready"); } })
      .catch((e) => { if (!cancelled) { setError(formatIpcError(e)); setStatus("error"); } });
    return () => { cancelled = true; };
  }, [nonce]);

  const toggle = (m: InstalledModelInfo) => {
    const has = selected.some((s) => s.name === m.name);
    setSelected(has
      ? selected.filter((s) => s.name !== m.name)
      : [...selected, { name: m.name, size_bytes: m.size_bytes }]);
  };

  return (
    <div data-testid="compare-model-select" className="space-y-1">
      <div className="text-xs text-gray-600">Installed models</div>
      {status === "loading" && (
        <div className="text-xs text-gray-500" data-testid="model-select-loading">Loading…</div>
      )}
      {status === "error" && (
        <div role="alert" className="text-xs text-red-600" data-testid="model-select-error">
          {error}{" "}
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="underline">Retry</button>
        </div>
      )}
      {status === "ready" && available.length === 0 && (
        <div className="text-xs text-gray-500" data-testid="model-select-empty">
          No models installed yet. Add one from the Workspace.
        </div>
      )}
      {status === "ready" && available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.map((m) => {
            const isSelected = selected.some((s) => s.name === m.name);
            return (
              <button
                key={m.name}
                type="button"
                onClick={() => toggle(m)}
                aria-pressed={isSelected}
                data-testid={`model-chip-${m.name}`}
                className={`text-xs border rounded px-2 py-1 ${isSelected ? "bg-blue-600 text-white" : "hover:bg-gray-100"}`}
              >
                {m.name} · {formatBytes(m.size_bytes)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
