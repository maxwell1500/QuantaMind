import { invoke } from "@tauri-apps/api/core";

/// Clear regenerable app caches (eval history, batch reports, job logs, traces,
/// context-cliff measurements, recent-workspace list). Downloaded models, custom
/// eval collections, readiness profiles, and user settings are never touched.
/// Returns the number of bytes freed.
export async function clearAppCache(): Promise<number> {
  return (await invoke("clear_app_cache")) as number;
}
