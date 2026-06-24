import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const GgufMetadataSchema = z.object({
  architecture: z.string(),
  parameter_count: z.number().int().nonnegative().nullable(),
  context_length: z.number().int().nonnegative().nullable(),
  quantization: z.string().nullable(),
  family: z.string(),
});
export type GgufMetadata = z.infer<typeof GgufMetadataSchema>;

export async function inspectGguf(path: string): Promise<GgufMetadata> {
  const raw = await invoke("inspect_gguf", { path });
  return GgufMetadataSchema.parse(raw);
}

export async function installLocalGguf(path: string, name: string): Promise<void> {
  await invoke("install_local_gguf", { path, name });
}
