import { listen } from "@tauri-apps/api/event";
import {
  EVENT_STT_INSTALL_PROGRESS,
  SttInstallProgressSchema,
} from "../../../shared/ipc/stt/stt";
import { useSttInstallStore } from "./sttInstallStore";

let starting: Promise<void> | null = null;

/// Idempotent subscription to the STT download-progress event. Mirrors
/// features/models/state/downloadEventBus.ts — start it once at app boot.
export function startSttInstallBus(): Promise<void> {
  if (starting) return starting;
  starting = (async () => {
    await listen<unknown>(EVENT_STT_INSTALL_PROGRESS, (e) => {
      const parsed = SttInstallProgressSchema.safeParse(e.payload);
      if (!parsed.success) return;
      const store = useSttInstallStore.getState();
      if (parsed.data.phase === "downloading") {
        const { bytes_completed, bytes_total, file } = parsed.data;
        const pct = bytes_total > 0 ? Math.floor((bytes_completed / bytes_total) * 100) : 0;
        store.progress(file, pct);
      } else {
        store.finish();
      }
    });
  })();
  starting.catch((e) => {
    console.error("sttInstallBus startup failed:", e);
    starting = null;
  });
  return starting;
}

export function __resetSttInstallBusForTests() {
  starting = null;
}
