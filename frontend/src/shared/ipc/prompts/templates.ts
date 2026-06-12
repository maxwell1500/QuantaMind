import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const PromptTemplateSchema = z.object({ name: z.string(), body: z.string() });
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export async function listPromptTemplates(): Promise<PromptTemplate[]> {
  return z.array(PromptTemplateSchema).parse(await invoke("list_prompt_templates"));
}
