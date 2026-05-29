import { useState } from "react";
import { installLocalGguf } from "../../../../shared/ipc/models/gguf";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { useToast } from "../../../../shared/ui/Toast";
import { useInstalledModelsStore } from "../../state/installedModelsStore";

/// Import a folder GGUF (a llama.cpp model) into Ollama so it's runnable there
/// too. Reuses the local-install path with the model's on-disk `path`.
export function AddToOllamaButton({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const toast = useToast();

  const add = async () => {
    setBusy(true);
    try {
      await installLocalGguf(path, name);
      toast(`Added ${name} to Ollama`);
      await refresh();
    } catch (e) {
      toast(`Couldn't add to Ollama: ${formatIpcError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void add()}
      disabled={busy}
      data-testid={`add-to-ollama-${name}`}
      className="text-xs border rounded px-2 py-1 disabled:opacity-50"
    >
      {busy ? "Adding…" : "Add to Ollama"}
    </button>
  );
}
