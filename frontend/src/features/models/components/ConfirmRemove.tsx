import { useState } from "react";
import { formatBytes } from "../../../shared/format/bytes";

/// Confirm removing an installed model. When it exists in both backends, a
/// checkbox chooses whether to also delete the llama.cpp GGUF (default off:
/// remove from Ollama only, keep the file for llama.cpp).
export function ConfirmRemove({
  name,
  sizeBytes,
  inOllama,
  inLlama,
  onConfirm,
  onCancel,
}: {
  name: string;
  sizeBytes: number;
  inOllama: boolean;
  inLlama: boolean;
  onConfirm: (alsoLlama: boolean) => void;
  onCancel: () => void;
}) {
  // llama.cpp-only models can only be deleted as files; both-present defaults
  // to Ollama-only unless the user opts in.
  const [alsoLlama, setAlsoLlama] = useState(!inOllama);

  return (
    <div role="alertdialog" data-testid="downloads-confirm-delete" className="border rounded p-3 bg-amber-50 text-xs">
      Remove <strong>{name}</strong>? This will free up to {formatBytes(sizeBytes)}.
      {inOllama && inLlama && (
        <label className="flex items-center gap-2 mt-2" data-testid="confirm-also-llama">
          <input type="checkbox" checked={alsoLlama} onChange={(e) => setAlsoLlama(e.target.checked)} />
          Also delete the llama.cpp copy (the GGUF file); otherwise it stays for llama.cpp.
        </label>
      )}
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={() => onConfirm(alsoLlama)} className="border rounded px-2 py-1 bg-red-600 text-white">
          Remove
        </button>
        <button type="button" onClick={onCancel} className="border rounded px-2 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}
