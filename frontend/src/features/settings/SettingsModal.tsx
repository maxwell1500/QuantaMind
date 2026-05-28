import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useUiStore } from "../../shared/state/uiStore";

/// Settings dialog (gear / Cmd+,). Light-only for now; more controls land
/// here later.
export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void getVersion().then(setVersion).catch(() => {});
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
        <p className="text-sm text-gray-600">QuantaMind v{version ?? "…"}</p>
        <p className="text-xs text-gray-400 mt-1">More settings coming soon.</p>
      </div>
    </div>
  );
}
