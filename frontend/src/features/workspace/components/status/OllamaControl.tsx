import { useBackendStore } from "../../../../shared/state/backendStore";
import { useStopOllama } from "../../hooks/useStopOllama";
import { useStartOllama } from "../../hooks/useStartOllama";

/// Header Start/Stop control for the Ollama server. Shows Stop when the
/// server is up and Start when it's down. Detailed install/error recovery
/// stays in the model-area empty state.
export function OllamaControl() {
  const healthy = useBackendStore((s) => s.ollamaHealthy);
  const { stop, status: stopStatus } = useStopOllama();
  const { start, status: startStatus } = useStartOllama();

  if (healthy === null) return null;
  if (healthy) {
    return (
      <button
        type="button"
        onClick={() => void stop()}
        disabled={stopStatus === "stopping"}
        title="Stop the Ollama server"
        data-testid="ollama-stop"
        className="text-sm text-gray-600 hover:text-ink px-2 py-1 disabled:opacity-50"
      >
        {stopStatus === "stopping" ? "Stopping…" : "Stop Ollama"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={startStatus === "starting"}
      title="Start the Ollama server"
      data-testid="ollama-start"
      className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1 disabled:opacity-50"
    >
      {startStatus === "starting" ? "Starting…" : "Start Ollama"}
    </button>
  );
}
