import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const InferenceParamsSchema = z.object({
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  top_k: z.number().int().optional(),
  max_tokens: z.number().int().optional(),
  repeat_penalty: z.number().optional(),
  seed: z.number().int().optional(),
});
export type InferenceParams = z.infer<typeof InferenceParamsSchema>;

export const PromptFileSchema = z.object({
  name: z.string(),
  system: z.string().default(""),
  user: z.string().default(""),
  model: z.string().nullable().optional(),
  params: InferenceParamsSchema.default({}),
  created_at: z.string(),
  updated_at: z.string(),
  auto_rerun: z.boolean().default(false),
});
export type PromptFile = z.infer<typeof PromptFileSchema>;

export async function loadPrompt(path: string): Promise<PromptFile> {
  const raw = await invoke("load_prompt", { path });
  return PromptFileSchema.parse(raw);
}

export async function savePrompt(path: string, file: PromptFile): Promise<PromptFile> {
  const raw = await invoke("save_prompt", { path, file });
  return PromptFileSchema.parse(raw);
}

export async function createPrompt(parent: string, name: string): Promise<string> {
  const raw = await invoke("create_prompt", { parent, name });
  return z.string().parse(raw);
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  await invoke("rename_path", { old: oldPath, new: newPath });
}
