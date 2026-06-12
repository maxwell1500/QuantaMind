import { useCallback } from "react";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useToast } from "../../../shared/ui/Toast";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { renamePath } from "../../../shared/ipc/workspace/prompts";

const EXT = ".quantamind.yaml";

/// Rename a prompt in place: keep its directory + `.quantamind.yaml` suffix,
/// swap the base name, then refresh the tree and re-select it if it was open.
/// Empty names and collisions are rejected (no-op / backend error → toast).
export function useRenamePrompt() {
  const refreshTree = useWorkspacesStore((s) => s.refreshTree);
  const selectPrompt = useWorkspacesStore((s) => s.selectPrompt);
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const showToast = useToast();
  return useCallback(async (oldPath: string, name: string) => {
    const base = name.trim().replace(/\.quantamind\.yaml$/, "");
    if (!base) return;
    const dir = oldPath.slice(0, oldPath.lastIndexOf("/"));
    const newPath = `${dir}/${base}${EXT}`;
    if (newPath === oldPath) return;
    try {
      await renamePath(oldPath, newPath);
      await refreshTree();
      if (currentPath === oldPath) await selectPrompt(newPath);
    } catch (e) { showToast(`Couldn't rename: ${formatIpcError(e)}`); }
  }, [refreshTree, selectPrompt, currentPath, showToast]);
}
