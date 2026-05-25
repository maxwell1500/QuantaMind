import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../../features/workspace/state/workspaceStore";
import { useInstalledModelsStore } from "../../features/models/state/installedModelsStore";

interface HealthResult { available: boolean; version: string | null }

/// One-shot "refresh everything live" — Ollama health probe + installed
/// models list, in parallel. Called from the global Refresh button so the
/// user doesn't have to wait up to 5s for the StatusBar's next health
/// tick to reconcile state after they (re)start Ollama.
export async function refreshAll(): Promise<void> {
  const [health] = await Promise.allSettled([
    invoke<HealthResult>("check_ollama_health"),
    useInstalledModelsStore.getState().refresh(),
  ]);
  if (health.status === "fulfilled") {
    useWorkspaceStore.getState().setOllamaHealthy(health.value.available);
  }
}
