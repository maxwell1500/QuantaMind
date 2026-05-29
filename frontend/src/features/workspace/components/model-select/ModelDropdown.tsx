import { useEffect, useRef, useState } from "react";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { isEmbeddingModel } from "../../../../shared/models/classify";
import { formatBytes } from "../../../../shared/format/bytes";
import { useCompareStore } from "../../../compare/state/compareStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

/// Dropdown model picker. Pick one model for a single run or several to
/// compare. Replaces the flat chip list. Selection lives in
/// compareStore.selectedModels.
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

  useEffect(() => { if (status === "idle") void refresh(); }, [status, refresh]);
  // Models differ per backend; drop the prior selection on an actual switch
  // (not the initial mount, which would wipe a restored selection).
  const prevBackend = useRef(activeBackend);
  useEffect(() => {
    if (prevBackend.current !== activeBackend) { prevBackend.current = activeBackend; setSelected([]); }
  }, [activeBackend, setSelected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  // llama.cpp runs one server at a time, so its picker is single-select.
  const single = activeBackend === "llama_cpp";
  const toggle = (m: { name: string; size_bytes: number }) => {
    const on = selected.some((s) => s.name === m.name);
    if (single) {
      setSelected(on ? [] : [{ name: m.name, size_bytes: m.size_bytes }]);
      return;
    }
    setSelected(
      on
        ? selected.filter((s) => s.name !== m.name)
        : [...selected, { name: m.name, size_bytes: m.size_bytes }],
    );
  };

  const generative = list.filter((m) => !isEmbeddingModel(m) && m.backend === activeBackend);
  const summary = selected.length === 0 ? "Select a model"
    : selected.length === 1 ? selected[0].name : `${selected.length} models`;

  return (
    <div className="relative" data-testid="compare-model-select" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border rounded px-3 py-1 text-sm min-w-[12rem] text-left flex justify-between gap-2"
        data-testid="model-dropdown"
      >
        <span className="truncate">{summary}</span>
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
            {generative.map((m) => {
              const on = selected.some((s) => s.name === m.name);
              return (
                <label
                  key={m.name}
                  data-testid={`model-option-${m.name}`}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 cursor-pointer"
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(m)} />
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-[10px] text-gray-400">{formatBytes(m.size_bytes)}</span>
                </label>
              );
            })}
          </div>
      )}
    </div>
  );
}
