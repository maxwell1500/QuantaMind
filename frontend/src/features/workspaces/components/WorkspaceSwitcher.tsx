import { useEffect, useState } from "react";
import { useWorkspacesStore } from "../state/workspaceStore";
import { useOpenWorkspace } from "../hooks/useOpenWorkspace";
import { recentWorkspaces, type RecentEntry } from "../../../shared/ipc/workspace/workspaces";

const baseName = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

export function WorkspaceSwitcher() {
  const root = useWorkspacesStore((s) => s.root);
  const { browse, openPath } = useOpenWorkspace();
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    recentWorkspaces()
      .then((r) => setRecents(r.entries))
      .catch((e) => console.error("recents load failed:", e));
  }, [root]);

  return (
    <div className="relative px-2 pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-sm font-medium truncate hover:text-blue-700"
        data-testid="workspace-switcher"
      >
        {root ? baseName(root) : "No workspace"} <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-56 bg-surface border rounded shadow text-sm">
          <button
            type="button"
            onClick={() => { setOpen(false); void browse(); }}
            className="block w-full text-left px-3 py-2 hover:bg-gray-100 text-blue-600"
          >
            Open folder…
          </button>
          {recents.length > 0 && <div className="border-t" />}
          {recents.map((r) => (
            <button
              key={r.path}
              type="button"
              title={r.path}
              onClick={() => { setOpen(false); void openPath(r.path); }}
              className="block w-full text-left px-3 py-1.5 hover:bg-gray-100 truncate"
            >
              {baseName(r.path)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
