import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// One downloadable MLX whisper model (mlx-community/whisper-*). est_vram null →
// "Not available" (never fabricated).
export const MlxSttCatalogEntrySchema = z.object({
  repo: z.string(),
  display: z.string(),
  disk_bytes: z.number(),
  est_vram_bytes: z.number().nullable(),
  multilingual: z.boolean(),
});
export type MlxSttCatalogEntry = z.infer<typeof MlxSttCatalogEntrySchema>;

export const InstalledMlxSttModelSchema = z.object({
  repo: z.string(),
  display: z.string(),
  path: z.string(),
  size_bytes: z.number(),
});
export type InstalledMlxSttModel = z.infer<typeof InstalledMlxSttModelSchema>;

// Apple-Silicon support + whether mlx_audio.server is installed.
export const MlxSttEnvSchema = z.object({
  supported: z.boolean(),
  found: z.boolean(),
  dir: z.string().nullable(),
});
export type MlxSttEnv = z.infer<typeof MlxSttEnvSchema>;

export const MlxSttStartResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("already_running") }),
  z.object({ status: z.literal("started"), pid: z.number().int().nonnegative(), port: z.number().int().nonnegative() }),
  z.object({ status: z.literal("not_found") }),
  z.object({ status: z.literal("no_free_port"), note: z.string() }),
  z.object({ status: z.literal("start_failed"), error: z.string(), stderr_tail: z.string() }),
]);
export type MlxSttStartResult = z.infer<typeof MlxSttStartResultSchema>;

export const MlxSttPhaseSchema = z.enum(["downloading", "starting", "ready", "exited"]);
export const MlxSttServerStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("stopped") }),
  z.object({ state: z.literal("running"), port: z.number().int(), phase: MlxSttPhaseSchema }),
  z.object({ state: z.literal("exited"), code: z.number().int().nullable(), stderr_tail: z.string() }),
]);
export type MlxSttServerStatus = z.infer<typeof MlxSttServerStatusSchema>;

export async function checkMlxSttEnv(): Promise<MlxSttEnv> {
  return MlxSttEnvSchema.parse(await invoke("check_mlx_stt_env"));
}

export async function startMlxSttServer(): Promise<MlxSttStartResult> {
  return MlxSttStartResultSchema.parse(await invoke("start_mlx_stt_server"));
}

export async function stopMlxSttServer(): Promise<void> {
  await invoke("stop_mlx_stt_server");
}

export async function mlxSttStatus(): Promise<MlxSttServerStatus> {
  return MlxSttServerStatusSchema.parse(await invoke("mlx_stt_status"));
}

export async function listMlxSttCatalog(): Promise<MlxSttCatalogEntry[]> {
  return z.array(MlxSttCatalogEntrySchema).parse(await invoke("list_mlx_stt_catalog"));
}

export async function listInstalledMlxSttModels(): Promise<InstalledMlxSttModel[]> {
  return z.array(InstalledMlxSttModelSchema).parse(await invoke("list_installed_mlx_stt_models"));
}

export async function downloadMlxSttModel(repo: string): Promise<void> {
  await invoke("download_mlx_stt_model", { repo });
}

export async function deleteMlxSttModel(repo: string): Promise<void> {
  await invoke("delete_mlx_stt_model", { repo });
}
