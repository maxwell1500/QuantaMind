import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { HealthStatus } from "../core/types";

// One curated whisper model (pre-download disclosure). `est_vram_bytes` is null
// when unmeasured — the UI shows "Not available", never a fabricated figure.
export const SttCatalogEntrySchema = z.object({
  id: z.string(),
  display: z.string(),
  whisper_repo: z.string(),
  whisper_file: z.string(),
  disk_bytes: z.number(),
  est_vram_bytes: z.number().nullable(),
  multilingual: z.boolean(),
});
export type SttCatalogEntry = z.infer<typeof SttCatalogEntrySchema>;

// A model that is installed and usable (ggml + shared VAD both validated).
export const InstalledSttModelSchema = z.object({
  id: z.string(),
  display: z.string(),
  model_path: z.string(),
  vad_path: z.string(),
  size_bytes: z.number(),
});
export type InstalledSttModel = z.infer<typeof InstalledSttModelSchema>;

// Whether the whisper.cpp engine is present AND runnable in this environment.
export const WhisperEnvSchema = z.object({
  found: z.boolean(),
  dir: z.string().nullable(),
  runnable: z.boolean(),
  error: z.string().nullable(),
});
export type WhisperEnv = z.infer<typeof WhisperEnvSchema>;

// Tagged outcome of start_whisper_server — the UI branches on `status` to show
// precise, actionable guidance for each failure.
export const SttStartResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("already_running") }),
  z.object({
    status: z.literal("started"),
    pid: z.number().int().nonnegative(),
    port: z.number().int().nonnegative(),
  }),
  z.object({ status: z.literal("not_bundled"), note: z.string() }),
  z.object({ status: z.literal("model_missing"), note: z.string() }),
  z.object({ status: z.literal("vad_missing"), note: z.string() }),
  z.object({ status: z.literal("port_conflict"), note: z.string() }),
  z.object({ status: z.literal("start_failed"), error: z.string(), stderr_tail: z.string() }),
]);
export type SttStartResult = z.infer<typeof SttStartResultSchema>;

export const EVENT_STT_INSTALL_PROGRESS = "stt-install-progress";
export const SttInstallProgressSchema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("downloading"),
    file: z.string(),
    bytes_completed: z.number(),
    bytes_total: z.number(),
    speed_bps: z.number(),
  }),
  z.object({ phase: z.literal("done") }),
]);
export type SttInstallProgress = z.infer<typeof SttInstallProgressSchema>;

export async function listSttCatalog(): Promise<SttCatalogEntry[]> {
  return z.array(SttCatalogEntrySchema).parse(await invoke("list_stt_catalog"));
}

export async function listInstalledSttModels(): Promise<InstalledSttModel[]> {
  return z.array(InstalledSttModelSchema).parse(await invoke("list_installed_stt_models"));
}

export async function checkWhisperEnv(): Promise<WhisperEnv> {
  return WhisperEnvSchema.parse(await invoke("check_whisper_env"));
}

export async function checkWhisperHealth(): Promise<HealthStatus> {
  return invoke<HealthStatus>("check_whisper_health");
}

export async function downloadSttModel(id: string): Promise<void> {
  await invoke("download_stt_model", { id });
}

export async function cancelSttInstall(): Promise<void> {
  await invoke("cancel_stt_install");
}

export async function startWhisperServer(
  modelPath: string,
  vadPath: string,
): Promise<SttStartResult> {
  return SttStartResultSchema.parse(
    await invoke("start_whisper_server", { modelPath, vadPath }),
  );
}

export async function stopWhisperServer(): Promise<void> {
  await invoke("stop_whisper_server");
}
