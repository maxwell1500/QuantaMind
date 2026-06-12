import { useBackendStore } from "../../../../shared/state/backendStore";
import { useSelectedModelStore } from "../../../../shared/state/selectedModelStore";
import { useMlxServer } from "../../hooks/useMlxServer";
import { PlayStopButton } from "../../../../shared/ui/PlayStopButton";

/// Header play/stop for the app-managed mlx_lm.server, mirroring the llama.cpp
/// control: launch it on the global MLX model's local directory. The spinner
/// covers the multi-minute first-run weight load.
export function MlxServerControl() {
  const healthy = useBackendStore((s) => s.mlxHealthy);
  const model = useSelectedModelStore((s) =>
    s.selectedModels.find((m) => m.backend === "mlx") ?? null,
  );
  const { start, stop, starting, error } = useMlxServer();
  const path = model?.path;

  return (
    <div className="space-y-0.5">
      <PlayStopButton
        running={!!healthy}
        busy={starting}
        disabled={!path}
        onPlay={() => path && void start(path)}
        onStop={() => void stop()}
        title={path ? "Start mlx_lm.server on the selected model" : "Select an MLX model first"}
        label="MLX"
        playTestId="mlx-start"
        stopTestId="mlx-stop"
      />
      {error && (
        <p data-testid="mlx-start-error" className="px-2 text-[10px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
