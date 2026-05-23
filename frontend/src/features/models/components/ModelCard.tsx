import { useEffect, useState } from "react";
import { useModelInstall } from "../hooks/useModelInstall";
import { useModelStore } from "../state/modelStore";
import type { ModelCatalogEntry } from "../data/ollama-catalog";
import {
  checkInstallFeasibility,
  type InstallFeasibility,
} from "../../../shared/ipc/feasibility";
import { InstallFeasibilityDialog } from "./InstallFeasibilityDialog";

type Props = { model: ModelCatalogEntry; isInstalled: boolean };

export function ModelCard({ model, isInstalled }: Props) {
  const { state, install, cancel: cancelInstall } = useModelInstall(model.name);
  const setInstallInFlight = useModelStore((s) => s.setInstallInFlight);
  const [pending, setPending] = useState<InstallFeasibility | null>(null);

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
  const percent = state.progress ? Math.round(state.progress.percentComplete) : 0;

  const handleInstall = async () => {
    const sizeBytes = Math.round(model.estimatedDiskGB * 1024 ** 3);
    const f = await checkInstallFeasibility(sizeBytes);
    if (f.kind === "ok") install(model.name);
    else setPending(f);
  };
  const confirm = () => { setPending(null); install(model.name); };
  const dismissFeasibility = () => setPending(null);

  return (
    <div data-testid={`model-card-${model.name}`} className="border rounded p-3 flex flex-col gap-1">
      <div className="font-medium text-sm">{model.name}</div>
      <div className="text-xs text-gray-500">
        {model.family} · {model.parameterSize} · {model.defaultQuantization}
      </div>
      <div className="text-xs text-gray-700">{model.description}</div>
      <div className="text-xs text-gray-500">{model.estimatedDiskGB.toFixed(1)}GB</div>
      <div className="mt-1">
        {installed ? (
          <span className="text-xs text-green-600" data-testid="installed-badge">
            Installed ✓
          </span>
        ) : pulling ? (
          <div data-testid="installing-state" className="flex items-center gap-2">
            <progress value={percent} max={100} className="flex-1 h-2" />
            <span className="text-xs tabular-nums w-10 text-right">{percent}%</span>
            <button
              type="button"
              onClick={() => void cancelInstall()}
              className="text-xs border rounded px-2 py-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={handleInstall} className="text-xs border rounded px-2 py-1">
            Install
          </button>
        )}
      </div>
      {pending && (
        <InstallFeasibilityDialog
          feasibility={pending}
          modelName={model.name}
          onConfirm={confirm}
          onCancel={dismissFeasibility}
        />
      )}
    </div>
  );
}
