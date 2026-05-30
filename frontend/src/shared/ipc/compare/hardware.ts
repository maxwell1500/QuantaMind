import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const HardwareSnapshotSchema = z.object({
  total_memory_bytes: z.number().int().nonnegative(),
  available_memory_bytes: z.number().int().nonnegative(),
  is_apple_silicon: z.boolean(),
});
export type HardwareSnapshot = z.infer<typeof HardwareSnapshotSchema>;

export async function getHardwareSnapshot(): Promise<HardwareSnapshot> {
  const raw = await invoke("get_hardware_snapshot");
  return HardwareSnapshotSchema.parse(raw);
}
