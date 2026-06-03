import { useEffect } from "react";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { isEmbeddingModel } from "../../../../shared/models/classify";
import { dedupeByDigest } from "../../../../shared/models/dedupeDigest";
import { modelLabel } from "../../../../shared/models/modelLabel";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useNavStore } from "../../../../shared/state/navStore";
import { ModelTemperaturePopover } from "./ModelTemperaturePopover";
import { OllamaEmptyState } from "../status/OllamaEmptyState";
import { useStopOllama } from "../../hooks/useStopOllama";

type Props = {
  value: string | null;
  onChange: (model: string) => void;
};

export function ModelPicker({ value, onChange }: Props) {
  const goToModels = useNavStore((s) => s.setTopView);
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const error = useInstalledModelsStore((s) => s.error);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const { status: stopStatus, stop } = useStopOllama();

  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  // Re-fetch when Ollama transitions to healthy — the user may have just
  // started it.
  useEffect(() => {
    if (ollamaHealthy === true) void refresh();
  }, [ollamaHealthy, refresh]);

  const generative = dedupeByDigest(list.filter((m) => !isEmbeddingModel(m)));

  return (
    <div className="flex gap-2 items-center flex-wrap">
      {ollamaHealthy === false ? (
        <OllamaEmptyState />
      ) : error ? (
        <div role="alert" className="text-red-600 text-sm flex-1">
          {error}
        </div>
      ) : (
        <>
          <ModelTemperaturePopover modelName={value} />
          <select
            aria-label="Model"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="" disabled>
              Pick a model
            </option>
            {generative.map((m) => (
              <option key={m.name} value={m.name}>
                {modelLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void stop()}
            disabled={stopStatus === "stopping"}
            aria-label="Stop Ollama server"
            title="Stop Ollama server"
            data-testid="ollama-stop-button"
            className="border rounded p-1 text-sm hover:bg-red-50 disabled:opacity-40"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        </>
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
