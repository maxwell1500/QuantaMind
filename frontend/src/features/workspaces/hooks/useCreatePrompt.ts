import { useCallback } from "react";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useToast } from "../../../shared/ui/Toast";
import { formatIpcError } from "../../../shared/ipc/error";
import { createPrompt } from "../../../shared/ipc/prompts";

/// Shared "new prompt" flow used by the Files panel's inline input and
/// the Cmd+N shortcut. The name comes from the caller (window.prompt is a
/// no-op in the Tauri webview), then create the file, refresh, select it.
export function useCreatePrompt() {
  const root = useWorkspacesStore((s) => s.root);
  const setTree = useWorkspacesStore((s) => s.refreshTree);
  const selectPrompt = useWorkspacesStore((s) => s.selectPrompt);
  const showToast = useToast();
  return useCallback(async (name: string) => {
    if (!root) { showToast("Open a workspace first."); return; }
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const path = await createPrompt(root, trimmed);
      await setTree();
      await selectPrompt(path);
    } catch (e) { showToast(`Couldn't create: ${formatIpcError(e)}`); }
  }, [root, setTree, selectPrompt, showToast]);
}
