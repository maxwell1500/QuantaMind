import { useEffect } from "react";
import { useHistoryStore } from "../state/historyStore";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useParamsStore } from "../../../shared/state/paramsStore";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { useBackendStore } from "../../../shared/state/backendStore";
import type { HistoryEntry } from "../../../shared/ipc/workspace/history";
import { HistoryRow } from "./HistoryRow";

export function HistoryPanel() {
  const open = useHistoryStore((s) => s.open);
  const entries = useHistoryStore((s) => s.entries);
  const load = useHistoryStore((s) => s.load);
  const clear = useHistoryStore((s) => s.clear);
  const setOpen = useHistoryStore((s) => s.setOpen);
  const restoreDraft = useWorkspacesStore((s) => s.restoreDraft);

  useEffect(() => {
    if (open) void load().catch((e) => console.error("history load failed:", e));
  }, [open, load]);

  if (!open) return null;

  // Restore a past run into the global state: its inputs into a detached draft,
  // its params into the header (globalParams), and its model into the global
  // selection (switching backend when the model is installed).
  const restore = (e: HistoryEntry) => {
    restoreDraft({ name: e.name, user: e.user, system: e.system, model: e.model });
    useParamsStore.setState({ globalParams: e.params ?? {} });
    const m = useInstalledModelsStore.getState().list.find((x) => x.name === e.model);
    if (m) useBackendStore.getState().setSelectedBackend(m.backend);
    const backend = m?.backend ?? useBackendStore.getState().selectedBackend;
    useSelectedModelStore.getState().setSelectedModels([
      { name: e.model, backend, size_bytes: m?.size_bytes ?? 0, path: m?.path },
    ]);
    setOpen(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setOpen(false)} />
      <aside
        data-testid="history-panel"
        className="fixed right-0 top-0 z-40 h-full w-80 bg-surface border-l shadow-lg flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">History</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void clear()} className="text-xs text-gray-500 hover:text-red-600">Clear</button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-ink" aria-label="Close history">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-xs text-gray-500 text-center">No runs yet. Run a prompt to start your history.</p>
          ) : (
            entries.map((e) => <HistoryRow key={e.id} entry={e} onRestore={restore} />)
          )}
        </div>
      </aside>
    </>
  );
}
