import { useBackendStore } from "../../../../shared/state/backendStore";
import { useSelectedModelStore } from "../../../../shared/state/selectedModelStore";
import { useMlxServer } from "../../hooks/useMlxServer";

/// Start/Stop for the app-managed mlx_lm.server, mirroring the llama.cpp
/// control: launch it on the global model's local directory when it's an MLX
/// model (downloaded via the HuggingFace tab). Models are picked in the header.
export function MlxServerControl() {
  const healthy = useBackendStore((s) => s.mlxHealthy);
  const model = useSelectedModelStore((s) =>
    s.selectedModels.find((m) => m.backend === "mlx") ?? null,
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
