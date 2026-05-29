import { useEffect, useRef, useState } from "react";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { isEmbeddingModel } from "../../../../shared/models/classify";
import { formatBytes } from "../../../../shared/format/bytes";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useCompareStore } from "../../../compare/state/compareStore";

/// Model picker for the Workspace. Selection lives in compareStore.selectedModels.
/// Ollama is multi-select (1 = single run, 2+ = compare); llama.cpp is single-select.
export function ModelDropdown() {
  const selected = useCompareStore((s) => s.selectedModels);
  const setSelected = useCompareStore((s) => s.setSelectedModels);
  const activeBackend = useWorkspaceStore((s) => s.activeBackend);
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const error = useInstalledModelsStore((s) => s.error);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const multi = activeBackend === "ollama";
  const generative = list.filter((m) => !isEmbeddingModel(m) && m.backend === activeBackend);
  const has = (name: string) => selected.some((s) => s.name === name);

  useEffect(() => { if (status === "idle") void refresh(); }, [status, refresh]);
  // Drop selections that aren't on the active backend (also handles backend switch).
  useEffect(() => {
    if (status !== "ready" || generative.length === 0) return;
    const kept = selected.filter((s) => generative.some((m) => m.name === s.name));
    if (kept.length !== selected.length) setSelected(kept);
  }, [status, generative, selected, setSelected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const pick = (m: { name: string; size_bytes: number }) => {
    const entry = { name: m.name, size_bytes: m.size_bytes };
    if (!multi) { setSelected(has(m.name) ? [] : [entry]); setOpen(false); return; }
    setSelected(has(m.name) ? selected.filter((s) => s.name !== m.name) : [...selected, entry]);
  };

  const label = selected.length === 0 ? "Select a model"
    : selected.length === 1 ? selected[0].name : `${selected.length} models`;

  return (
    <div className="relative" data-testid="compare-model-select" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border rounded px-3 py-1 text-sm min-w-[12rem] text-left flex justify-between gap-2"
        data-testid="model-dropdown"
      >
        <span className="truncate">{label}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 max-h-72 overflow-y-auto bg-surface border rounded shadow text-sm">
          {(status === "idle" || status === "loading") && <div className="px-3 py-2 text-gray-500">Loading…</div>}
          {status === "error" && (
            <div role="alert" className="px-3 py-2 text-red-600">
              {error}{" "}
              <button type="button" onClick={() => void refresh()} className="underline">Retry</button>
            </div>
          )}
          {status === "ready" && generative.length === 0 && (
            <div className="px-3 py-2 text-gray-500">No models installed yet.</div>
          )}
          {generative.map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => pick(m)}
              data-testid={`model-option-${m.name}`}
              aria-pressed={has(m.name)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 ${has(m.name) ? "bg-blue-50" : ""}`}
            >
              <span className="flex-1 truncate">{m.name}</span>
              <span className="text-[10px] text-gray-400">{formatBytes(m.size_bytes)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
