import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export type UpdateInfo = {
  currentVersion: string;
  latestVersion: string;
  notes: string;
  date: string | undefined;
};

export async function getCurrentVersion(): Promise<string> {
  return getVersion();
}

/// Calls the updater plugin. Returns null when the running version is
/// already the latest, or an Update handle when a newer version is
/// available. Throws on network / signature / config errors.
export async function checkForUpdate(): Promise<Update | null> {
  return check();
}

export async function downloadAndInstall(
  update: Update,
  onChunk?: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let total: number | null = null;
  let downloaded = 0;
  await update.downloadAndInstall((evt) => {
    if (evt.event === "Started") {
      total = evt.data.contentLength ?? null;
    } else if (evt.event === "Progress") {
      downloaded += evt.data.chunkLength;
      onChunk?.(downloaded, total);
    }
  });
  await relaunch();
}
