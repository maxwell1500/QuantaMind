import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getInstalledModelsWithStats,
  type InstalledModelInfo,
} from "../../../shared/ipc/storage";
import { formatIpcError } from "../../../shared/ipc/error";
import { isEmbeddingModel } from "../../../shared/models/classify";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useNavStore } from "../../../shared/state/navStore";

type Props = {
  value: string | null;
  onChange: (model: string) => void;
};

const EVENT_MODELS_CHANGED = "models-changed";

export function ModelPicker({ value, onChange }: Props) {
  const goToModels = useNavStore((s) => s.setTopView);
  const [models, setModels] = useState<InstalledModelInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const wasHealthy = useRef<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    const refresh = () =>
      getInstalledModelsWithStats()
        .then((list) => { if (!cancelled) { setModels(list); setError(null); } })
        .catch((e) => { if (!cancelled) setError(formatIpcError(e)); });
    refresh();
    (async () => {
      const u = await listen(EVENT_MODELS_CHANGED, () => { refresh(); });
      if (cancelled) u(); else unsub = u;
    })();
    return () => { cancelled = true; unsub?.(); };
  }, []);

  useEffect(() => {
    if (ollamaHealthy === true && wasHealthy.current !== true) {
      getInstalledModelsWithStats()
        .then((list) => { setModels(list); setError(null); })
        .catch((e) => setError(formatIpcError(e)));
    }
    wasHealthy.current = ollamaHealthy;
  }, [ollamaHealthy]);

  const effectiveError = error
    ?? (ollamaHealthy === false ? "Ollama is not running. Start Ollama and try again." : null);
  const generative = models.filter((m) => !isEmbeddingModel(m));

  return (
    <div className="flex gap-2 items-center flex-wrap">
      {effectiveError ? (
        <div role="alert" className="text-red-600 text-sm flex-1">
          {effectiveError}
        </div>
      ) : (
        <select
          aria-label="Model"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="" disabled>Pick a model</option>
          {generative.map((m) => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={() => goToModels("models")}
        className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
        data-testid="add-model-button"
      >
        Add Model
      </button>
    </div>
  );
}
