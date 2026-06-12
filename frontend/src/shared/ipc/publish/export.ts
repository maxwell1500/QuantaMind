import { invoke } from "@tauri-apps/api/core";

/// Write the snapshotted readiness card PNG to a user-chosen path. The frontend
/// picks the path via the OS save dialog and snapshots the card to bytes; Rust is
/// the file sink (size/path validation lives there). Offline, no auth.
export async function saveReadinessImage(path: string, bytes: Uint8Array): Promise<void> {
  await invoke("save_readiness_image", { path, bytes: Array.from(bytes) });
}
