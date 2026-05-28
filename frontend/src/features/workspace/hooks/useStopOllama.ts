import { useCallback, useState } from "react";
import { stopOllama } from "../../../shared/ipc/models/ollama_start";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useWorkspaceStore } from "../state/workspaceStore";

export type StopOllamaStatus = "idle" | "stopping" | "error";

export function useStopOllama() {
  const [status, setStatus] = useState<StopOllamaStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    setError(null);
    setStatus("stopping");
    try {
      await stopOllama();
      useWorkspaceStore.getState().setOllamaHealthy(false);
      setStatus("idle");
    } catch (e) {
      setError(formatIpcError(e));
      setStatus("error");
    }
  }, []);

  return { status, error, stop };
}
