import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { listModels } from "../../../../shared/ipc/client";
import { formatIpcError } from "../../../../shared/ipc/error";
import { useModelInstall } from "../../hooks/useModelInstall";

const EVENT_MODELS_CHANGED = "models-changed";
const LIBRARY_URL = "https://ollama.com/library";

export function OllamaLibraryTab() {
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const { state, install, cancel } = useModelInstall(trimmed || undefined);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    const refresh = () => listModels()
      .then((list) => { if (!cancelled) setInstalled(new Set(list)); })
      .catch((e) => console.error("OllamaLibraryTab: listModels failed —", formatIpcError(e)));
    refresh();
    (async () => {
      try {
        const u = await listen(EVENT_MODELS_CHANGED, () => refresh());
        if (cancelled) u(); else unsub = u;
      } catch (e) {
        console.error("OllamaLibraryTab: listen(models-changed) failed —", formatIpcError(e));
      }
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const isInstalled = !!trimmed && installed.has(trimmed);
  const pulling = state.status === "pulling";
  const errored = state.status === "error";
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
    </div>
  );
}
