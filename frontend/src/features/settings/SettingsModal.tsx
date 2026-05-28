import { useEffect } from "react";
import { useUiStore } from "../../shared/state/uiStore";

/// Settings shell. Opened via the gear / Cmd+,. Theme controls land here
/// in Step 2.7; for now it hosts app info and a placeholder.
export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);

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
        className="bg-white rounded-lg shadow-xl w-96 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close settings" className="text-gray-500 hover:text-black">✕</button>
        </div>
        <p className="text-sm text-gray-500">Theme and appearance settings are coming soon.</p>
      </div>
    </div>
  );
}
