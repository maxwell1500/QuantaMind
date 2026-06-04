import { useCallback, useState } from "react";
import { stopLlamaServer } from "../../../shared/ipc/models/llama_start";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useBackendStore } from "../../../shared/state/backendStore";

export type StopLlamaStatus = "idle" | "stopping" | "error";

export function useStopLlamaServer() {
  const [status, setStatus] = useState<StopLlamaStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    setError(null);
    setStatus("stopping");
    try {
      await stopLlamaServer();
      useBackendStore.getState().setLlamaHealthy(false);
      setStatus("idle");
    } catch (e) {
      setError(formatIpcError(e));
      setStatus("error");
    }
  }, []);

  return { status, error, stop };
}
