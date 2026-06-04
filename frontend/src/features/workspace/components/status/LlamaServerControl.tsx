import { useBackendStore } from "../../../../shared/state/backendStore";
import { useSelectedModelStore } from "../../../../shared/state/selectedModelStore";
import { useStartLlamaServer } from "../../hooks/useStartLlamaServer";
import { useStopLlamaServer } from "../../hooks/useStopLlamaServer";

/// Manual Start/Stop for the llama-server sidecar. Start launches the server on
/// the global model's GGUF when it's a llama.cpp model (one model at a time); Stop kills it.
export function LlamaServerControl() {
  const healthy = useBackendStore((s) => s.llamaHealthy);
  const model = useSelectedModelStore((s) =>
    s.selectedModels.find((m) => m.backend === "llama_cpp") ?? null,
  );
  const { start, status: startStatus, error: startError } = useStartLlamaServer();
  const { stop, status: stopStatus } = useStopLlamaServer();

  if (healthy) {
    return (
      <button
        type="button"
        onClick={() => void stop()}
        disabled={stopStatus === "stopping"}
        title="Stop the llama-server sidecar"
        data-testid="llama-stop"
        className="text-xs text-gray-600 hover:text-ink px-2 py-1 disabled:opacity-50"
      >
        {stopStatus === "stopping" ? "Stopping…" : "Stop llama.cpp"}
      </button>
    );
  }
  const path = model?.path;
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => path && void start(path)}
        disabled={!path || startStatus === "starting"}
        title={path ? "Start llama-server on the selected model" : "Select a llama.cpp model first"}
        data-testid="llama-start"
        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 disabled:opacity-40"
      >
        {startStatus === "starting" ? "Starting…" : "Start llama.cpp"}
      </button>
      {startError && (
        <p data-testid="llama-start-error" className="px-2 text-[10px] text-red-600">
          {startError}
        </p>
      )}
    </div>
  );
}
