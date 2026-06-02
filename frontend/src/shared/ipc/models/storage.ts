import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const BackendKindSchema = z.enum(["ollama", "llama_cpp", "mlx"]);
export type BackendKind = z.infer<typeof BackendKindSchema>;

export const InstalledModelInfoSchema = z.object({
  name: z.string(),
  size_bytes: z.number().int().nonnegative(),
  modified_at: z.string(),
  family: z.string(),
  parameter_size: z.string(),
  quantization: z.string(),
  backend: BackendKindSchema,
  // Content hash of the model blob. Ollama sends one per tag (shared across
  // tags of the same model); absent for llama.cpp/MLX. The picker dedupes on it.
  digest: z.string().optional(),
  // Absolute GGUF path — present for llama.cpp models, absent for Ollama.
  path: z.string().optional(),
});
export type InstalledModelInfo = z.infer<typeof InstalledModelInfoSchema>;

export const DiskUsageSchema = z.object({
  total_bytes: z.number().int().nonnegative(),
  free_bytes: z.number().int().nonnegative(),
  ollama_models_bytes: z.number().int().nonnegative(),
});
export type DiskUsage = z.infer<typeof DiskUsageSchema>;

export async function getInstalledModelsWithStats(): Promise<InstalledModelInfo[]> {
  const raw = await invoke("get_installed_models_with_stats");
  return z.array(InstalledModelInfoSchema).parse(raw);
}

export async function removeModel(name: string): Promise<void> {
  await invoke("remove_model", { name });
}

export async function getDiskUsage(): Promise<DiskUsage> {
  const raw = await invoke("get_disk_usage");
  return DiskUsageSchema.parse(raw);
}
