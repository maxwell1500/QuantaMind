import { useWorkspaceStore } from "../../state/workspaceStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useCompareStore } from "../../../compare/state/compareStore";
import { useMlxServer } from "../../hooks/useMlxServer";

/// Start/Stop for the app-managed mlx_lm.server, mirroring the llama.cpp
/// control: launch it on the selected MLX model's local directory (downloaded
/// via the HuggingFace tab). No repo input — models are picked in the dropdown.
export function MlxServerControl() {
  const healthy = useWorkspaceStore((s) => s.mlxHealthy);
  const selectedName = useCompareStore((s) => s.selectedModels[0]?.name ?? null);
  const model = useInstalledModelsStore((s) =>
    s.list.find((m) => m.name === selectedName && m.backend === "mlx"),
  );
  const { start, stop, starting, phase, error } = useMlxServer();

  if (healthy) {
    return (
      <button
        type="button"
        onClick={() => void stop()}
        data-testid="mlx-stop"
        className="text-xs text-gray-600 hover:text-ink px-2 py-1"
      >
        Stop MLX
      </button>
    );
  }
  const path = model?.path;
  const label = starting
    ? phase === "downloading" ? "Loading weights…" : "Starting…"
    : "Start MLX";
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => path && void start(path)}
        disabled={!path || starting}
        title={path ? "Start mlx_lm.server on the selected model" : "Select an MLX model first"}
        data-testid="mlx-start"
        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 disabled:opacity-40"
      >
        {label}
      </button>
      {error && (
        <p data-testid="mlx-start-error" className="px-2 text-[10px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
