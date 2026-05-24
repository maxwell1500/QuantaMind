import { useEffect, useMemo, useState } from "react";
import { useInstalledModelsStore } from "../../state/installedModelsStore";
import { useModelInstall } from "../../hooks/useModelInstall";

const LIBRARY_URL = "https://ollama.com/library";

export function OllamaLibraryTab() {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const { state, install, cancel } = useModelInstall(trimmed || undefined);
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const installed = useMemo(
    () => new Set(list.map((m) => m.name)),
    [list],
  );

  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  const isInstalled = !!trimmed && installed.has(trimmed);
  const pulling = state.status === "pulling";
  const errored = state.status === "error";
  const succeeded = state.status === "success";
  const percent = state.progress ? Math.round(state.progress.percentComplete) : 0;
  const canInstall = !!trimmed && !pulling && !isInstalled;

  return (
    <div data-testid="tab-ollama" className="flex flex-col gap-3 h-full">
      <p className="text-xs text-gray-600">
        Type any Ollama model name (e.g. <code>mistral:7b</code>, <code>qwen2.5:14b</code>). Browse all available models at{" "}
        <a href={LIBRARY_URL} target="_blank" rel="noreferrer" className="underline">
          ollama.com/library
        </a>.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Ollama model name"
          placeholder="namespace/name:tag"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canInstall) install(trimmed); }}
          className="flex-1 border rounded px-2 py-1 text-sm font-mono"
          data-testid="ollama-name-input"
        />
        {pulling ? (
          <button type="button" onClick={() => void cancel()} className="text-xs border rounded px-3" data-testid="ollama-cancel">
            Cancel
          </button>
        ) : (
          <button
            type="button"
            disabled={!canInstall}
            onClick={() => install(trimmed)}
            className="text-xs border rounded px-3 disabled:opacity-50"
            data-testid="ollama-install"
          >
            {isInstalled ? "Installed ✓" : "Install"}
          </button>
        )}
      </div>
      {pulling && (
        <div data-testid="ollama-pulling" className="flex items-center gap-2">
          <progress value={percent} max={100} className="flex-1 h-2" />
          <span className="text-xs tabular-nums w-10 text-right">{percent}%</span>
        </div>
      )}
      {errored && state.error && (
        <div role="alert" data-testid="ollama-error" className="text-red-600 text-xs">
          {state.error}
        </div>
      )}
      {succeeded && trimmed && (
        <div role="status" data-testid="ollama-success" className="text-green-700 text-xs">
          Installed {trimmed} ✓ — open Workspace or Compare to use it.
        </div>
      )}
    </div>
  );
}
