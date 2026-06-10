import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const RecordingResultSchema = z.object({
  path: z.string(),
  /// False when the whole take was essentially silent (muted/wrong mic).
  had_audio: z.boolean(),
});
export type RecordingResult = z.infer<typeof RecordingResultSchema>;

/// Start native (Rust cpal) mic capture. macOS's mic permission prompt fires
/// here on first use; a denial records silence (surfaced as had_audio=false).
export async function startRecording(): Promise<void> {
  await invoke("start_recording");
}

/// Stop capture; the returned path is the atomic ready-to-transcribe signal.
export async function stopRecording(): Promise<RecordingResult> {
  return RecordingResultSchema.parse(await invoke("stop_recording"));
}

/// Live input RMS (0..~1) while recording — polled for the level meter.
export async function recordingLevel(): Promise<number> {
  return z.number().parse(await invoke("recording_level"));
}
