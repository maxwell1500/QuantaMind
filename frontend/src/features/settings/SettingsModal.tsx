import { useEffect } from "react";
import { useUiStore } from "../../shared/state/uiStore";
import { useThemeStore, type ThemeMode } from "../../shared/state/themeStore";

const MODES: ThemeMode[] = ["system", "light", "dark"];

/// Settings dialog (gear / Cmd+,). Hosts the theme selector.
export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

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
        aria-label="Settings"
        data-testid="settings-modal"
        className="bg-surface rounded-lg shadow-xl w-96 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close settings" className="text-gray-500 hover:text-ink">✕</button>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">Theme</span>
          <div className="flex border rounded overflow-hidden" role="group" aria-label="Theme">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void setMode(m)}
                aria-pressed={mode === m}
                data-testid={`theme-${m}`}
                className={`px-3 py-1 text-xs capitalize ${
                  mode === m ? "bg-blue-600 text-white" : "bg-surface text-gray-600 hover:bg-gray-100"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
