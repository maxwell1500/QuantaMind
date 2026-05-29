import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { InstalledModelInfoSchema, type InstalledModelInfo } from "./storage";

export const LlamaStartResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("already_running") }),
  z.object({
    status: z.literal("started"),
    pid: z.number().int().nonnegative(),
    port: z.number().int().nonnegative(),
  }),
  z.object({ status: z.literal("not_bundled"), note: z.string() }),
  z.object({ status: z.literal("start_failed"), error: z.string() }),
]);
export type LlamaStartResult = z.infer<typeof LlamaStartResultSchema>;

/// Start the llama-server sidecar on a specific GGUF (one model at a time).
export async function startLlamaServer(modelPath: string): Promise<LlamaStartResult> {
  const raw = await invoke("start_llama_server", { modelPath });
  return LlamaStartResultSchema.parse(raw);
}

export async function stopLlamaServer(): Promise<void> {
  await invoke("stop_llama_server");
}

/// GGUF models discovered on disk for the llama.cpp backend.
export async function listLlamaModels(): Promise<InstalledModelInfo[]> {
  const raw = await invoke("list_llama_models");
  return z.array(InstalledModelInfoSchema).parse(raw);
}
