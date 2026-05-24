import { useEffect } from "react";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { isEmbeddingModel } from "../../../shared/models/classify";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useNavStore } from "../../../shared/state/navStore";

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

  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  // Re-fetch when Ollama transitions to healthy — the user may have just
  // started it.
  useEffect(() => {
    if (ollamaHealthy === true) void refresh();
  }, [ollamaHealthy, refresh]);

  const effectiveError =
    error ??
    (ollamaHealthy === false
      ? "Ollama is not running. Start Ollama and try again."
      : null);
  const generative = list.filter((m) => !isEmbeddingModel(m));

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
          <option value="" disabled>
            Pick a model
          </option>
          {generative.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
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
