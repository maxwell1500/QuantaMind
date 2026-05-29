import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const BenchModelSchema = z.object({
  name: z.string(),
  size_bytes: z.number().int().nonnegative().default(0),
});

export const BenchConfigSchema = z.object({
  name: z.string(),
  models: z.array(BenchModelSchema).default([]),
  strategy: z.string().default("sequential"),
  system: z.string().default(""),
  user: z.string().default(""),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
});
export type BenchConfig = z.infer<typeof BenchConfigSchema>;

export const BenchEntrySchema = z.object({ name: z.string(), path: z.string() });
export type BenchEntry = z.infer<typeof BenchEntrySchema>;

export async function saveBenchConfig(name: string, config: BenchConfig): Promise<BenchConfig> {
  return BenchConfigSchema.parse(await invoke("save_bench_config", { name, config }));
}

export async function loadBenchConfig(path: string): Promise<BenchConfig> {
  return BenchConfigSchema.parse(await invoke("load_bench_config", { path }));
}

export async function listBenchConfigs(): Promise<BenchEntry[]> {
  return z.array(BenchEntrySchema).parse(await invoke("list_bench_configs"));
}
