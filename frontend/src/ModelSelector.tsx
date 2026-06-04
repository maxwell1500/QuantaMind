import { useEffect, useRef, useState } from "react";
import { useInstalledModelsStore } from "./features/models/state/installedModelsStore";
import { isEmbeddingModel } from "./shared/models/classify";
import { dedupeByDigest } from "./shared/models/dedupeDigest";
import { modelLabel } from "./shared/models/modelLabel";
import { formatBytes } from "./shared/format/bytes";
import { useBackendStore } from "./shared/state/backendStore";
import { useSelectedModelStore } from "./shared/state/selectedModelStore";
import { useParamsStore } from "./shared/state/paramsStore";
import { usePopoverDismiss } from "./shared/ui/usePopoverDismiss";

/// The global model picker in the header, filtered to the selected backend. Ollama
/// is multi-select (1 → single run, 2+ → a compare in the Workspace); llama.cpp/MLX
/// are single-select. Writes the global selectedModelStore — every page reads it.
export function ModelSelector() {
  const selectedBackend = useBackendStore((s) => s.selectedBackend);
  const selectedModels = useSelectedModelStore((s) => s.selectedModels);
  const setSelectedModels = useSelectedModelStore((s) => s.setSelectedModels);
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const error = useInstalledModelsStore((s) => s.error);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const keepLoaded = useParamsStore((s) => s.keepLoaded);
  const setKeepLoaded = useParamsStore((s) => s.setKeepLoaded);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const multi = selectedBackend === "ollama";
  const generative = dedupeByDigest(
    list.filter((m) => !isEmbeddingModel(m) && m.backend === selectedBackend),
  );
  const has = (name: string) => selectedModels.some((s) => s.name === name);

  useEffect(() => { if (status === "idle") void refresh(); }, [status, refresh]);
  usePopoverDismiss(open, ref, () => setOpen(false));

  const pick = (m: { name: string; size_bytes: number; backend: typeof selectedBackend; path?: string }) => {
    const entry = { name: m.name, backend: m.backend, size_bytes: m.size_bytes, path: m.path };
    if (!multi) { setSelectedModels(has(m.name) ? [] : [entry]); setOpen(false); return; }
    setSelectedModels(has(m.name) ? selectedModels.filter((s) => s.name !== m.name) : [...selectedModels, entry]);
  };

  const labelFor = (name: string) => modelLabel(list.find((x) => x.name === name) ?? { name });
  const label = selectedModels.length === 0 ? "Select a model"
    : selectedModels.length === 1 ? labelFor(selectedModels[0].name)
    : `${selectedModels.length} models`;

  return (
    <div className="relative" data-testid="header-model-select" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border rounded px-3 py-1 text-sm min-w-[12rem] text-left flex justify-between gap-2"
        data-testid="header-model-dropdown"
      >
        <span className="truncate">{label}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 max-h-72 overflow-y-auto bg-surface border rounded shadow text-sm">
          <label
            className="flex items-center gap-2 px-3 py-2 border-b text-xs text-gray-600 select-none"
            title="Keep the model resident across runs (Ollama). Off lets it unload when idle, freeing memory; the just-run model stays inspectable for a few minutes."
          >
            <input
              type="checkbox"
              checked={keepLoaded}
              onChange={(e) => setKeepLoaded(e.target.checked)}
              data-testid="header-keep-loaded"
            />
            Keep model loaded
          </label>
          {(status === "idle" || status === "loading") && <div className="px-3 py-2 text-gray-500">Loading…</div>}
          {status === "error" && (
            <div role="alert" className="px-3 py-2 text-red-600">
              {error}{" "}
              <button type="button" onClick={() => void refresh()} className="underline">Retry</button>
            </div>
          )}
          {status === "ready" && generative.length === 0 && (
            <div className="px-3 py-2 text-gray-500">No models for this backend.</div>
          )}
          {generative.map((m) => {
            const active = has(m.name);
            return (
              <button
                key={m.name}
                type="button"
                onClick={() => pick(m)}
                data-testid={`header-model-option-${m.name}`}
                aria-pressed={active}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 ${active ? "bg-blue-50" : ""}`}
              >
                {multi && (
                  <span
                    aria-hidden
                    className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${active ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300"}`}
                  >
                    {active ? "✓" : ""}
                  </span>
                )}
                <span className="flex-1 truncate">{modelLabel(m)}</span>
                {m.size_bytes > 0 && (
                  <span className="text-[10px] text-gray-400">{formatBytes(m.size_bytes)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
