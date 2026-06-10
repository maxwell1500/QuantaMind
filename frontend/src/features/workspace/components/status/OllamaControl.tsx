import { useBackendStore } from "../../../../shared/state/backendStore";
import { useStopOllama } from "../../hooks/useStopOllama";
import { useStartOllama } from "../../hooks/useStartOllama";
import { PlayStopButton } from "../../../../shared/ui/PlayStopButton";

/// Header play/stop for the Ollama server. Detailed install/error recovery stays
/// in the model-area empty state.
export function OllamaControl() {
  const healthy = useBackendStore((s) => s.ollamaHealthy);
  const { stop, status: stopStatus } = useStopOllama();
  const { start, status: startStatus } = useStartOllama();

  if (healthy === null) return null;
  return (
    <PlayStopButton
      running={healthy}
      busy={startStatus === "starting" || stopStatus === "stopping"}
      onPlay={() => void start()}
      onStop={() => void stop()}
      label="Ollama"
      playTestId="ollama-start"
      stopTestId="ollama-stop"
    />
  );
}
