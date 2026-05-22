import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

const Ok = z.object({ kind: z.literal("ok") });
const Warning = z.object({
  kind: z.literal("warning"),
  free_after_bytes: z.number().int().nonnegative(),
});
const Blocked = z.object({
  kind: z.literal("blocked_insufficient_space"),
  free_after_bytes: z.number().int().nonnegative(),
  free_bytes: z.number().int().nonnegative(),
  needed_bytes: z.number().int().nonnegative(),
});

export const InstallFeasibilitySchema = z.discriminatedUnion("kind", [
  Ok,
  Warning,
  Blocked,
]);
export type InstallFeasibility = z.infer<typeof InstallFeasibilitySchema>;

export async function checkInstallFeasibility(
  estimatedSizeBytes: number,
): Promise<InstallFeasibility> {
  const raw = await invoke("check_install_feasibility", {
    estimatedSizeBytes,
  });
  return InstallFeasibilitySchema.parse(raw);
}
