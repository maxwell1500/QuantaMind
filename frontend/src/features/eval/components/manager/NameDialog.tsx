import { useEffect, useState } from "react";

/// Small modal to name a new collection before opening the editor. Matches the
/// app's modal pattern: backdrop click + Escape close, card stops propagation.
export function NameDialog({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = name.trim();
  const submit = () => {
    if (trimmed) onCreate(trimmed);
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      data-testid="eval-name-dialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Name your collection"
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg shadow-xl w-80 max-w-[90vw] p-5 space-y-3 border border-gray-100"
      >
        <h3 className="text-sm font-semibold text-gray-900">New collection</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Collection name"
          data-testid="eval-name-input"
          className="w-full rounded-md bg-white border border-gray-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 px-3 py-2 text-sm text-gray-900 outline-none transition-colors"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="eval-name-cancel"
            className="px-3 py-1.5 rounded-md text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={submit}
            data-testid="eval-name-create"
            className="px-3 py-1.5 rounded-md text-sm text-white bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
