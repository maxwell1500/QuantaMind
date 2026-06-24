import { useCallback, useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { startOllama } from "../../../shared/ipc/models/ollama_start";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useBackendStore } from "../../../shared/state/backendStore";

export type StartOllamaStatus =
  | "idle" | "starting" | "success" | "error" | "not_installed";

const SUCCESS_LINGER_MS = 1000;

export function useStartOllama() {
  const [status, setStatus] = useState<StartOllamaStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);

  const onSuccess = useCallback(() => {
    setStatus("success");
    setTimeout(() => {
      useBackendStore.getState().setOllamaHealthy(true);
      void useInstalledModelsStore.getState().refresh();
      setStatus("idle");
    }, SUCCESS_LINGER_MS);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setInstallUrl(null);
    setStatus("starting");
    try {
      const result = await startOllama();
      switch (result.status) {
        case "already_running":
        case "started":
          onSuccess();
          return;
        case "not_installed":
          setInstallUrl(result.install_url);
          setStatus("not_installed");
          return;
        case "start_failed":
          setError(result.error);
          setStatus("error");
          return;
      }
    } catch (e) {
      setError(formatIpcError(e));
      setStatus("error");
    }
  }, [onSuccess]);

  const openInstallPage = useCallback(async () => {
    const url = installUrl ?? "https://ollama.com/download";
    try { await openExternal(url); }
    catch (e) { setError(formatIpcError(e)); setStatus("error"); }
  }, [installUrl]);

  return { status, error, installUrl, start, openInstallPage };
}
