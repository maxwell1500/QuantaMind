import { useWorkspaceStore } from "../../state/workspaceStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useStartLlamaServer } from "../../hooks/useStartLlamaServer";
import { useStopLlamaServer } from "../../hooks/useStopLlamaServer";

/// Manual Start/Stop for the llama-server sidecar. Start launches the server on
/// the selected llama.cpp model's GGUF (one model at a time); Stop kills it.
export function LlamaServerControl() {
  const healthy = useWorkspaceStore((s) => s.llamaHealthy);
  const selectedName = useWorkspaceStore((s) => s.selectedModel);
  const model = useInstalledModelsStore((s) =>
    s.list.find((m) => m.name === selectedName && m.backend === "llama_cpp"),
  );
  const { start, status: startStatus } = useStartLlamaServer();
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
  );
}
