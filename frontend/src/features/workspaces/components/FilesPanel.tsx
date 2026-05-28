import { useCallback } from "react";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useOpenWorkspace } from "../hooks/useOpenWorkspace";
import { useCreatePrompt } from "../hooks/useCreatePrompt";
import { useToast } from "../../../shared/ui/Toast";
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
  const { browse } = useOpenWorkspace();
  const onCreate = useCreatePrompt();
  const showToast = useToast();

  const onDelete = useCallback(async (path: string) => {
    if (!window.confirm("Delete this prompt?")) return;
    try {
      await deletePath(path);
      if (currentPath === path) clearSelection();
      await setTree();
    } catch (e) { showToast(`Couldn't delete: ${formatIpcError(e)}`); }
  }, [currentPath, clearSelection, setTree, showToast]);

  return (
    <aside
      data-testid="files-panel"
      className="w-64 shrink-0 border-r pr-3 pl-1 py-2 overflow-y-auto"
    >
      <WorkspaceSwitcher />
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Files</span>
        {root && (
          <button
            type="button"
            onClick={onCreate}
            className="text-xs text-blue-600 hover:text-blue-800"
            data-testid="files-new"
          >
            + New
          </button>
        )}
      </div>
      {!root ? (
        <button
          type="button"
          onClick={browse}
          className="w-full text-sm text-left px-2 py-2 text-blue-600 hover:bg-gray-100 rounded"
        >
          Open folder…
        </button>
      ) : tree.length === 0 ? (
        <p className="px-2 text-xs text-gray-500">No prompts yet. Click + New.</p>
      ) : (
        <FilesTree
          nodes={tree}
          currentPath={currentPath}
          onSelect={selectPrompt}
          onDelete={onDelete}
        />
      )}
    </aside>
  );
}
