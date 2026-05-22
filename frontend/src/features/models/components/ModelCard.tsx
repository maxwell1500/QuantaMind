import { useEffect } from "react";
import { useModelInstall } from "../hooks/useModelInstall";
import { useModelStore } from "../state/modelStore";
import type { ModelCatalogEntry } from "../data/ollama-catalog";

type Props = {
  model: ModelCatalogEntry;
  isInstalled: boolean;
};

export function ModelCard({ model, isInstalled }: Props) {
  const { state, install } = useModelInstall();
  const setInstallInFlight = useModelStore((s) => s.setInstallInFlight);

  useEffect(() => {
    if (state.status === "pulling") {
      setInstallInFlight({
        source: "ollama",
        name: model.name,
        progress: Math.round(state.progress?.percentComplete ?? 0),
      });
    } else if (state.status !== "idle") {
      setInstallInFlight(null);
    }
  }, [state, model.name, setInstallInFlight]);

  const installed = isInstalled || state.status === "success";
  const pulling = state.status === "pulling";
  const percent = state.progress
    ? Math.round(state.progress.percentComplete)
    : 0;

  return (
    <div
      data-testid={`model-card-${model.name}`}
      className="border rounded p-3 flex flex-col gap-1"
    >
      <div className="font-medium text-sm">{model.name}</div>
      <div className="text-xs text-gray-500">
        {model.family} · {model.parameterSize} · {model.defaultQuantization}
      </div>
      <div className="text-xs text-gray-700">{model.description}</div>
      <div className="text-xs text-gray-500">
        {model.estimatedDiskGB.toFixed(1)}GB
      </div>
      <div className="mt-1">
        {installed ? (
          <span className="text-xs text-green-600" data-testid="installed-badge">
            Installed ✓
          </span>
        ) : pulling ? (
          <span className="text-xs text-blue-600" data-testid="installing-state">
            Installing · {percent}%
          </span>
        ) : (
          <button
            type="button"
            onClick={() => install(model.name)}
            className="text-xs border rounded px-2 py-1"
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
