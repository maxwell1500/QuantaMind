import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { useToast } from "../../../shared/ui/Toast";
import { formatIpcError } from "../../../shared/ipc/error";
import type { TreeNode } from "../../../shared/ipc/workspaces";

/// A restored history entry loads as an unsaved draft (currentPath===null).
/// One click saves it into the open workspace as a real file, auto-named
/// from the prompt's name (deduped against the folder).
function uniqueName(tree: TreeNode[], base: string): string {
  const taken = new Set(
    tree.filter((n) => n.kind === "file").map((n) => n.name.replace(/\.quantamind\.yaml$/, "")),
  );
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

export function DraftBanner() {
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const current = useWorkspacesStore((s) => s.current);
  const root = useWorkspacesStore((s) => s.root);
  const tree = useWorkspacesStore((s) => s.tree);
  const saveAs = useWorkspacesStore((s) => s.saveAs);
  const showToast = useToast();
  if (currentPath !== null || !current) return null;

  const save = async () => {
    if (!root) { showToast("Open a workspace to save."); return; }
    const base = current.name && current.name !== "restored" ? current.name : "untitled";
    try { await saveAs(uniqueName(tree, base)); }
    catch (e) { showToast(`Couldn't save: ${formatIpcError(e)}`); }
  };

  return (
    <div
      data-testid="draft-banner"
      className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-300 rounded px-2 py-1"
    >
      <span className="text-amber-800">Unsaved draft</span>
      <button
        type="button"
        onClick={() => void save()}
        data-testid="draft-save"
        className="border rounded px-2 py-0.5 text-blue-600 hover:bg-surface"
      >
        Save
      </button>
    </div>
  );
}
