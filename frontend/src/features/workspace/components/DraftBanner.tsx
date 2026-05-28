import { useState } from "react";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";

/// Shown when a restored history entry is loaded as an unsaved draft
/// (currentPath === null). Lets the user name it and save it as a new
/// prompt file in the open workspace.
export function DraftBanner() {
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const current = useWorkspacesStore((s) => s.current);
  const root = useWorkspacesStore((s) => s.root);
  const saveAs = useWorkspacesStore((s) => s.saveAs);
  const [name, setName] = useState("");
  if (currentPath !== null || !current) return null;

  return (
    <div
      data-testid="draft-banner"
      className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-300 rounded px-2 py-1"
    >
      <span className="text-amber-800">Unsaved draft</span>
      {root ? (
        <input
          value={name}
          placeholder="save as…"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void saveAs(name.trim()); }}
          className="flex-1 border rounded px-1 py-0.5"
          data-testid="draft-saveas"
        />
      ) : (
        <span className="text-gray-500">Open a workspace to save it.</span>
      )}
    </div>
  );
}
