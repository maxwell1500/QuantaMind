import { useCallback } from "react";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useToast } from "../../../shared/ui/Toast";
import { formatIpcError } from "../../../shared/ipc/error";
import { createPrompt } from "../../../shared/ipc/prompts";

/// Shared "new prompt" flow used by the Files panel + New button and the
/// Cmd+N shortcut: prompt for a name, create the file, refresh, select it.
export function useCreatePrompt() {
  const root = useWorkspacesStore((s) => s.root);
  const setTree = useWorkspacesStore((s) => s.refreshTree);
  const selectPrompt = useWorkspacesStore((s) => s.selectPrompt);
  const showToast = useToast();
  return useCallback(async () => {
    if (!root) { showToast("Open a workspace first."); return; }
    const name = window.prompt("New prompt name (no extension):");
    if (!name) return;
    try {
      const path = await createPrompt(root, name);
      await setTree();
      await selectPrompt(path);
    } catch (e) { showToast(`Couldn't create: ${formatIpcError(e)}`); }
  }, [root, setTree, selectPrompt, showToast]);
}
