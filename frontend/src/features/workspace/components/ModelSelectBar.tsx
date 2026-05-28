import { useWorkspaceStore } from "../state/workspaceStore";
import { useNavStore } from "../../../shared/state/navStore";
import { OllamaEmptyState } from "./OllamaEmptyState";
import { ModelMultiSelect } from "../../compare/components/ModelMultiSelect";

/// Model selection for the unified page: pick one model for a single run,
/// or two-plus to compare. Gated by Ollama health; "Add Model" jumps to
/// the Models tab.
export function ModelSelectBar() {
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const goToModels = useNavStore((s) => s.setTopView);

  if (ollamaHealthy === false) return <OllamaEmptyState />;
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1 min-w-0">
        <ModelMultiSelect />
      </div>
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
