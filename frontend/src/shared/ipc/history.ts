import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { InferenceParamsSchema, type InferenceParams } from "./prompts";

export const HistoryEntrySchema = z.object({
  id: z.string(),
  prompt_path: z.string().nullable().optional(),
  model: z.string(),
  system: z.string().default(""),
  user: z.string().default(""),
  params: InferenceParamsSchema.default({}),
  output_preview: z.string().default(""),
  output_len: z.number().int(),
  token_count: z.number().int(),
  ran_at: z.string(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export interface AppendArgs {
  prompt_path: string | null;
  model: string;
  system: string;
  user: string;
  params: InferenceParams;
  output: string;
  token_count: number;
}

export async function historyAppend(entry: AppendArgs): Promise<void> {
  await invoke("history_append", { entry });
}

export async function historyList(): Promise<HistoryEntry[]> {
  const raw = await invoke("history_list");
  return z.array(HistoryEntrySchema).parse(raw);
}

export async function historyGet(id: string): Promise<string> {
  return z.string().parse(await invoke("history_get", { id }));
}

export async function historyClear(): Promise<void> {
  await invoke("history_clear");
}
