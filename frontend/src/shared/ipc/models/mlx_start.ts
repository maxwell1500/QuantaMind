import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const MlxStartResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("already_running") }),
  z.object({
    status: z.literal("started"),
    pid: z.number().int().nonnegative(),
    port: z.number().int().nonnegative(),
  }),
  z.object({ status: z.literal("not_found") }),
  z.object({ status: z.literal("no_free_port") }),
  z.object({ status: z.literal("start_failed"), error: z.string() }),
]);
export type MlxStartResult = z.infer<typeof MlxStartResultSchema>;

export const MlxPhaseSchema = z.enum(["downloading", "starting", "ready", "exited"]);
export const MlxServerStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("stopped") }),
  z.object({ state: z.literal("running"), phase: MlxPhaseSchema, model: z.string() }),
  z.object({ state: z.literal("exited"), code: z.number().int().nullable(), stderr_tail: z.string() }),
]);
export type MlxServerStatus = z.infer<typeof MlxServerStatusSchema>;

/// Launch the app-managed mlx_lm.server on a local model directory (downloaded
/// via install_mlx_model). Returns immediately — readiness is polled via
/// mlxServerStatus + health.
export async function startMlxServer(modelPath: string): Promise<MlxStartResult> {
  return MlxStartResultSchema.parse(await invoke("start_mlx_server", { modelPath }));
}

export async function stopMlxServer(): Promise<void> {
  await invoke("stop_mlx_server");
}

export async function mlxServerStatus(): Promise<MlxServerStatus> {
  return MlxServerStatusSchema.parse(await invoke("mlx_server_status"));
}
