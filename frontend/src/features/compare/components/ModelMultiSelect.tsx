import { useEffect } from "react";
import {
  useInstalledModelsStore,
} from "../../models/state/installedModelsStore";
import { formatBytes } from "../../../shared/format/bytes";
import { isEmbeddingModel } from "../../../shared/models/classify";
import { useCompareStore } from "../state/compareStore";

export function ModelMultiSelect() {
  const selected = useCompareStore((s) => s.selectedModels);
  const setSelected = useCompareStore((s) => s.setSelectedModels);
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const error = useInstalledModelsStore((s) => s.error);
  const refresh = useInstalledModelsStore((s) => s.refresh);

  // If the bus hasn't fired yet (e.g. mount before App effect runs), kick
  // off the first fetch ourselves.
  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  const toggle = (m: { name: string; size_bytes: number }) => {
    const has = selected.some((s) => s.name === m.name);
    setSelected(
      has
        ? selected.filter((s) => s.name !== m.name)
        : [...selected, { name: m.name, size_bytes: m.size_bytes }],
    );
  };

  return (
    <div data-testid="compare-model-select" className="space-y-1">
      <div className="text-xs text-gray-600">Installed models</div>
      {(status === "idle" || status === "loading") && (
        <div className="text-xs text-gray-500" data-testid="model-select-loading">
          Loading…
        </div>
      )}
      {status === "error" && (
        <div role="alert" className="text-xs text-red-600" data-testid="model-select-error">
          {error}{" "}
          <button type="button" onClick={() => void refresh()} className="underline">
            Retry
          </button>
        </div>
      )}
      {status === "ready" && list.length === 0 && (
        <div className="text-xs text-gray-500" data-testid="model-select-empty">
          No models installed yet. Add one from the Workspace.
        </div>
      )}
      {status === "ready" && list.length > 0 && (() => {
        const generative = list.filter((m) => !isEmbeddingModel(m));
        const hidden = list.length - generative.length;
        return (
          <>
            <div className="flex flex-wrap gap-1">
              {generative.map((m) => {
                const isSelected = selected.some((s) => s.name === m.name);
                return (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => toggle(m)}
                    aria-pressed={isSelected}
                    data-testid={`model-chip-${m.name}`}
                    className={`text-xs border rounded px-2 py-1 ${
                      isSelected ? "bg-blue-600 text-white" : "hover:bg-gray-100"
                    }`}
                  >
                    {m.name} · {formatBytes(m.size_bytes)}
                  </button>
                );
              })}
            </div>
            {hidden > 0 && (
              <div className="text-xs text-gray-500" data-testid="multi-hidden-count">
                {hidden} embedding-only model{hidden === 1 ? "" : "s"} hidden
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
