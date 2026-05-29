import { formatBytes } from "../../../shared/format/bytes";

/// Confirm-and-free dialog for removing an installed Ollama model.
export function ConfirmRemove({
  name,
  sizeBytes,
  onConfirm,
  onCancel,
}: {
  name: string;
  sizeBytes: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      data-testid="downloads-confirm-delete"
      className="border rounded p-3 bg-amber-50 text-xs"
    >
      Remove <strong>{name}</strong>? This will free {formatBytes(sizeBytes)}.
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={onConfirm} className="border rounded px-2 py-1 bg-red-600 text-white">
          Remove
        </button>
        <button type="button" onClick={onCancel} className="border rounded px-2 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}
