import { useCallback, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useCreatePrompt } from "../hooks/useCreatePrompt";
import { useRenamePrompt } from "../hooks/useRenamePrompt";
import { useToast } from "../../../shared/ui/Toast";
import { useUiStore } from "../../../shared/state/uiStore";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { deletePath } from "../../../shared/ipc/workspace/workspaces";
import { historyRemoveByPath } from "../../../shared/ipc/workspace/history";
import { useHistoryStore } from "../../history/state/historyStore";
import { FilesTree } from "./FilesTree";

export function FilesSection() {
  const root = useWorkspacesStore((s) => s.root);
  const tree = useWorkspacesStore((s) => s.tree);
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const selectPrompt = useWorkspacesStore((s) => s.selectPrompt);
  const refreshTree = useWorkspacesStore((s) => s.refreshTree);
  const clearSelection = useWorkspacesStore((s) => s.clearSelection);
  const creating = useUiStore((s) => s.creatingPrompt);
  const setCreating = useUiStore((s) => s.setCreatingPrompt);
  const create = useCreatePrompt();
  const rename = useRenamePrompt();
  const showToast = useToast();
  const [name, setName] = useState("");

  const submit = async () => {
    const n = name;
    setName(""); setCreating(false);
    await create(n);
  };
  const cancel = () => { setName(""); setCreating(false); };

  const onDelete = useCallback(async (path: string) => {
    const ok = await ask("Delete this prompt? This can't be undone.", { title: "Delete prompt", kind: "warning" });
    if (!ok) return;
    try {
      await deletePath(path);
      if (currentPath === path) clearSelection();
      await refreshTree();
      // Keep History in sync: drop runs that belonged to the deleted prompt.
      await historyRemoveByPath(path);
      await useHistoryStore.getState().load();
    } catch (e) { showToast(`Couldn't delete: ${formatIpcError(e)}`); }
  }, [currentPath, clearSelection, refreshTree, showToast]);

  return (
    <div data-testid="files-section">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-gray-400">Files</span>
        {root && (
          <button type="button" onClick={() => setCreating(true)} className="text-xs text-blue-600 hover:text-blue-800" data-testid="files-new">
            + New
          </button>
        )}
      </div>
      {root && creating && (
        <input
          autoFocus
          value={name}
          placeholder="prompt-name"
          onChange={(e) => setName(e.target.value)}
          onBlur={cancel}
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); if (e.key === "Escape") cancel(); }}
          className="w-full text-sm border rounded px-2 py-1 mb-2"
          data-testid="files-new-input"
        />
      )}
      {!root ? (
        <p className="px-2 text-xs text-gray-500">Open a folder above to start.</p>
      ) : tree.length === 0 ? (
        <p className="px-2 text-xs text-gray-500">No prompts yet. Click + New.</p>
      ) : (
        <FilesTree nodes={tree} currentPath={currentPath} onSelect={selectPrompt} onRename={rename} onDelete={onDelete} />
      )}
    </div>
  );
}
