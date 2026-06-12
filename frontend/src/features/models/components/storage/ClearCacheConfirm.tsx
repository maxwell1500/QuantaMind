import { useState } from "react";

const CONFIRM_WORD = "CLEAR";

/// Type-to-confirm guard for wiping regenerable app caches. The destructive
/// button stays disabled until the user types CLEAR, so a bulk delete can't
/// happen on a single misclick. Models, custom collections, and settings are
/// never affected — the copy spells that out.
export function ClearCacheConfirm({
  onConfirm,
  onCancel,
  busy,
  error,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  return (
    <div role="alertdialog" data-testid="clear-cache-confirm" className="border rounded p-3 bg-amber-50 text-xs">
      Clear cached app data? This deletes eval history, batch reports, job logs,
      pipeline traces, context-cliff measurements, and the recent-workspace list.
      <strong> Your downloaded models, custom eval collections, readiness profiles,
      and settings are kept.</strong>
      <label className="flex flex-col gap-1 mt-2">
        Type <strong>{CONFIRM_WORD}</strong> to confirm:
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
          data-testid="clear-cache-input"
          className="border rounded px-2 py-1 w-40"
          autoFocus
        />
      </label>
      {error && <div role="alert" className="text-red-600 mt-2">{error}</div>}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!armed || busy}
          data-testid="clear-cache-confirm-btn"
          className="border rounded px-2 py-1 bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Clearing…" : "Clear cache"}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="border rounded px-2 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}
