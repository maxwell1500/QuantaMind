import { useCallback, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useOpenWorkspace } from "../hooks/useOpenWorkspace";
import { useCreatePrompt } from "../hooks/useCreatePrompt";
import { useToast } from "../../../shared/ui/Toast";
import { useUiStore } from "../../../shared/state/uiStore";
import { formatIpcError } from "../../../shared/ipc/error";
import { deletePath } from "../../../shared/ipc/workspaces";
import { FilesTree } from "./FilesTree";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function FilesPanel() {
  const root = useWorkspacesStore((s) => s.root);
  const tree = useWorkspacesStore((s) => s.tree);
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const selectPrompt = useWorkspacesStore((s) => s.selectPrompt);
  const setTree = useWorkspacesStore((s) => s.refreshTree);
  const clearSelection = useWorkspacesStore((s) => s.clearSelection);
  const creating = useUiStore((s) => s.creatingPrompt);
  const setCreating = useUiStore((s) => s.setCreatingPrompt);
  const { browse } = useOpenWorkspace();
  const create = useCreatePrompt();
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
      await setTree();
    } catch (e) { showToast(`Couldn't delete: ${formatIpcError(e)}`); }
  }, [currentPath, clearSelection, setTree, showToast]);

  return (
    <aside data-testid="files-panel" className="w-64 shrink-0 border-r pr-3 pl-1 py-2 overflow-y-auto">
      <WorkspaceSwitcher />
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Files</span>
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
        <button type="button" onClick={browse} className="w-full text-sm text-left px-2 py-2 text-blue-600 hover:bg-gray-100 rounded">
          Open folder…
        </button>
      ) : tree.length === 0 ? (
        <p className="px-2 text-xs text-gray-500">No prompts yet. Click + New.</p>
      ) : (
        <FilesTree nodes={tree} currentPath={currentPath} onSelect={selectPrompt} onDelete={onDelete} />
      )}
    </aside>
  );
}
