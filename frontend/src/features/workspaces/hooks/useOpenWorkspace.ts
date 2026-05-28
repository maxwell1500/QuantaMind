import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useToast } from "../../../shared/ui/Toast";
import { formatIpcError } from "../../../shared/ipc/core/error";

export function useOpenWorkspace() {
  const openIn = useWorkspacesStore((s) => s.open);
  const showToast = useToast();

  const browse = useCallback(async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    try { await openIn(picked); }
    catch (e) { showToast(`Couldn't open folder: ${formatIpcError(e)}`); }
  }, [openIn, showToast]);

  const openPath = useCallback(async (path: string) => {
    try { await openIn(path); }
    catch (e) { showToast(`Couldn't open folder: ${formatIpcError(e)}`); }
  }, [openIn, showToast]);

  return { browse, openPath };
}
