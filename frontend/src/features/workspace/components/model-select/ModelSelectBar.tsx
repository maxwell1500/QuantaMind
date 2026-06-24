import { useBackendStore } from "../../../../shared/state/backendStore";
import { useNavStore } from "../../../../shared/state/navStore";
import { OllamaEmptyState } from "../status/OllamaEmptyState";

/// Workspace model affordances. The picker itself now lives in the global header
/// (ModelSelector); this keeps the Ollama-down empty state (install help) and an
/// "Add Model" shortcut to the Models tab.
export function ModelSelectBar() {
  const ollamaHealthy = useBackendStore((s) => s.ollamaHealthy);
  const activeBackend = useBackendStore((s) => s.selectedBackend);
  const goToModels = useNavStore((s) => s.setTopView);

  // The Ollama-down empty state only applies when Ollama is the active backend.
  if (activeBackend === "ollama" && ollamaHealthy === false) return <OllamaEmptyState />;
  return (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={() => goToModels("models")}
        className="border rounded px-3 py-1 text-sm hover:bg-gray-50 shrink-0"
        data-testid="add-model-button"
      >
        Add Model
      </button>
    </div>
  );
}
