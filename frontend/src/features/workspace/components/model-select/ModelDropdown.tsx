import { useEffect, useRef, useState } from "react";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { isEmbeddingModel } from "../../../../shared/models/classify";
import { formatBytes } from "../../../../shared/format/bytes";
import { useWorkspaceStore } from "../../state/workspaceStore";

/// Single-model picker for the Workspace. Selection lives in
/// workspaceStore.selectedModel and is scoped to the active backend.
export function ModelDropdown() {
  const selected = useWorkspaceStore((s) => s.selectedModel);
  const setSelected = useWorkspaceStore((s) => s.setSelectedModel);
  const activeBackend = useWorkspaceStore((s) => s.activeBackend);
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const error = useInstalledModelsStore((s) => s.error);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const generative = list.filter((m) => !isEmbeddingModel(m) && m.backend === activeBackend);

  useEffect(() => { if (status === "idle") void refresh(); }, [status, refresh]);
  // Clear a selection that isn't in the active backend (skip when none loaded).
  useEffect(() => {
    if (status !== "ready" || generative.length === 0) return;
    if (selected && !generative.some((m) => m.name === selected)) setSelected(null);
  }, [status, generative, selected, setSelected]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const pick = (name: string) => { setSelected(selected === name ? null : name); setOpen(false); };

  return (
    <div className="relative" data-testid="compare-model-select" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="border rounded px-3 py-1 text-sm min-w-[12rem] text-left flex justify-between gap-2"
        data-testid="model-dropdown"
      >
        <span className="truncate">{selected ?? "Select a model"}</span>
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
              onClick={() => pick(m.name)}
              data-testid={`model-option-${m.name}`}
              aria-pressed={selected === m.name}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 ${selected === m.name ? "bg-blue-50" : ""}`}
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
