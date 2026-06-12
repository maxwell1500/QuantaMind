import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

// GPU/VRAM, best-effort per platform. unified = shared memory (Apple Silicon;
// no separate VRAM pool). available:false → "Not available".
export const GpuInfoSchema = z.object({
  name: z.string().nullable().optional(),
  vram_total_bytes: z.number().int().nonnegative().nullable().optional(),
  vram_free_bytes: z.number().int().nonnegative().nullable().optional(),
  unified: z.boolean(),
  available: z.boolean(),
});
export type GpuInfo = z.infer<typeof GpuInfoSchema>;

export const HardwareSnapshotSchema = z.object({
  total_memory_bytes: z.number().int().nonnegative(),
  available_memory_bytes: z.number().int().nonnegative(),
  is_apple_silicon: z.boolean(),
  // Added in 4.5; optional so existing fixtures (memory-only) stay valid.
  cpu: z.string().optional(),
  physical_cores: z.number().int().nonnegative().nullable().optional(),
  os_name: z.string().nullable().optional(),
  os_version: z.string().nullable().optional(),
  arch: z.string().optional(),
  gpu: GpuInfoSchema.optional(),
  // Nominal Apple-Silicon memory bandwidth (GB/s); null/absent → "Not available".
  estimated_bandwidth_gbps: z.number().int().positive().nullable().optional(),
});
export type HardwareSnapshot = z.infer<typeof HardwareSnapshotSchema>;

export async function getHardwareSnapshot(): Promise<HardwareSnapshot> {
  const raw = await invoke("get_hardware_snapshot");
  return HardwareSnapshotSchema.parse(raw);
}
