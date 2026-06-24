import { listen } from "@tauri-apps/api/event";
import { useInstalledModelsStore } from "./installedModelsStore";

const EVENT_MODELS_CHANGED = "models-changed";

let starting: Promise<void> | null = null;

/// Single shared subscription to the backend's `models-changed` event.
/// Calls `installedModelsStore.refresh()` whenever an install/remove
/// fires, replacing the per-component `listen()` calls each consumer
/// used to register independently. Eliminates the listener-registration
/// race window and the duplicate fetches.
///
/// Idempotent — second call returns the same promise without
/// re-attaching. If `listen()` rejects transiently the singleton
/// resets so a later call can retry.
export function startInstalledModelsBus(): Promise<void> {
  if (starting) return starting;
  starting = (async () => {
    const refresh = () => {
      void useInstalledModelsStore.getState().refresh();
    };
    await listen(EVENT_MODELS_CHANGED, refresh);
    refresh();
  })();
  starting.catch((e) => {
    console.error("installedModelsBus startup failed:", e);
    starting = null;
  });
  return starting;
}

export function __resetInstalledModelsBusForTests() {
  starting = null;
}
