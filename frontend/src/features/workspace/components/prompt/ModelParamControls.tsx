import { useCompareStore } from "../../../compare/state/compareStore";
import { ModelParamCard } from "./ModelParamCard";

/// Multi-model parameter control: by default all models share the prompt's
/// parameters (the panel above); unchecking reveals a card per model so each
/// can be tuned independently before comparing.
export function ModelParamControls() {
  const useShared = useCompareStore((s) => s.useSharedParams);
  const setUseShared = useCompareStore((s) => s.setUseSharedParams);
  const selected = useCompareStore((s) => s.selectedModels);

  return (
    <div className="space-y-2" data-testid="model-param-controls">
      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={useShared}
          onChange={(e) => setUseShared(e.target.checked)}
          data-testid="same-params-toggle"
        />
        Use the same parameters for all models
      </label>
      {!useShared && (
        <div className="flex flex-wrap gap-2">
          {selected.map((m) => <ModelParamCard key={m.name} model={m.name} />)}
        </div>
      )}
    </div>
  );
}
