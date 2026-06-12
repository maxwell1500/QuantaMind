import { useEffect } from "react";
import { useUiStore } from "../state/uiStore";
import { SHORTCUTS, displayKeys, type ShortcutScope } from "./shortcuts";

const SCOPES: ShortcutScope[] = ["Global", "Workspace"];

export function CheatsheetModal() {
  const open = useUiStore((s) => s.cheatsheetOpen);
  const setOpen = useUiStore((s) => s.setCheatsheetOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        data-testid="cheatsheet-modal"
        className="bg-surface rounded-lg shadow-xl w-96 max-h-[80vh] overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-3">Keyboard shortcuts</h2>
        {SCOPES.map((scope) => (
          <div key={scope} className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{scope}</div>
            {SHORTCUTS.filter((s) => s.scope === scope).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-1 text-sm">
                <span className="text-gray-700">{s.label}</span>
                <kbd className="px-2 py-0.5 bg-gray-100 border rounded text-xs font-mono">{displayKeys(s.combo)}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
