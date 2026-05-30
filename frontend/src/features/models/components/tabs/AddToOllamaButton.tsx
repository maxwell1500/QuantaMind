import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { installLocalGguf } from "../../../../shared/ipc/models/gguf";
import {
  EVENT_LOCAL_INSTALL_PROGRESS,
  LocalInstallPhaseSchema,
  type LocalInstallPhase,
} from "../../../../shared/ipc/models/local_install";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { useToast } from "../../../../shared/ui/Toast";
import { useInstalledModelsStore } from "../../state/installedModelsStore";

function label(p: LocalInstallPhase): string {
  if (p.phase === "creating") return "Creating…";
  const pct = p.bytes_total ? Math.round((p.bytes_completed / p.bytes_total) * 100) : 0;
  return p.phase === "hashing" ? `Hashing ${pct}%` : `Uploading ${pct}%`;
}

/// Import a folder GGUF into Ollama (reuses the local-install path) so it's
/// runnable there too. Shows live phase progress — large models take a while.
export function AddToOllamaButton({ path, name }: { path: string; name: string }) {
  const [phase, setPhase] = useState<string | null>(null);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const toast = useToast();

  const add = async () => {
    setPhase("Starting…");
    const un = await listen<unknown>(EVENT_LOCAL_INSTALL_PROGRESS, (e) => {
      const p = LocalInstallPhaseSchema.safeParse(e.payload);
      if (p.success) setPhase(label(p.data));
    });
    try {
      await installLocalGguf(path, name);
      toast(`Added ${name} to Ollama`);
      await refresh();
    } catch (e) {
      toast(`Couldn't add to Ollama: ${formatIpcError(e)}`);
    } finally {
      un();
      setPhase(null);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void add()}
      disabled={phase !== null}
      title="Import this model into Ollama (can take a minute for large models)"
      data-testid={`add-to-ollama-${name}`}
      className="text-xs border rounded px-2 py-1 disabled:opacity-60 whitespace-nowrap"
    >
      {phase ?? "Add to Ollama"}
    </button>
  );
}
