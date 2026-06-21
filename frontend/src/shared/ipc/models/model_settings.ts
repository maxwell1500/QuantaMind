import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const DEFAULT_TEMPERATURE = 0.7;

export const ModelSettingsSchema = z.object({
  temperature: z.number().min(0).max(2),
  // Reasoning model (sidebar "thinking" toggle). Optional so settings written before this
  // field still parse (absent = false), mirroring the backend's #[serde(default)].
  is_thinking: z.boolean().optional(),
});
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

export const ModelSettingsMapSchema = z.record(z.string(), ModelSettingsSchema);
export type ModelSettingsMap = z.infer<typeof ModelSettingsMapSchema>;

export async function getModelSettings(): Promise<ModelSettingsMap> {
  const raw = await invoke("get_model_settings");
  return ModelSettingsMapSchema.parse(raw);
}

export async function setModelTemperature(
  model: string,
  temperature: number,
): Promise<void> {
  await invoke("set_model_temperature", { model, temperature });
}

export async function setModelThinking(
  model: string,
  isThinking: boolean,
): Promise<void> {
  await invoke("set_model_thinking", { model, isThinking });
}
