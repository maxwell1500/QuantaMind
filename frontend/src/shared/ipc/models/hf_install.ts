import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { BackendKind } from "./storage";

export const EVENT_HF_PROGRESS = "hf-progress";

const Downloading = z.object({
  phase: z.literal("downloading"),
  bytes_completed: z.number().int().nonnegative(),
  bytes_total: z.number().int().nonnegative(),
  speed_bps: z.number().int().nonnegative(),
});
const Hashing = z.object({
  phase: z.literal("hashing"),
  bytes_completed: z.number().int().nonnegative(),
  bytes_total: z.number().int().nonnegative(),
});
const Uploading = z.object({
  phase: z.literal("uploading"),
  bytes_completed: z.number().int().nonnegative(),
  bytes_total: z.number().int().nonnegative(),
});
const Installing = z.object({ phase: z.literal("installing") });

export const HfPhaseSchema = z.discriminatedUnion("phase", [
  Downloading, Hashing, Uploading, Installing,
]);
export type HfPhase = z.infer<typeof HfPhaseSchema>;

export async function installHfGguf(
  repo: string,
  filename: string,
  name: string,
  backend: BackendKind,
): Promise<void> {
  await invoke("install_hf_gguf", { repo, filename, name, backend });
}

export async function cancelHfInstall(): Promise<void> {
  await invoke("cancel_hf_install");
}
