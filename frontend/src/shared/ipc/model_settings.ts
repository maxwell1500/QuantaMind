import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const DEFAULT_TEMPERATURE = 0.7;

export const ModelSettingsSchema = z.object({
  temperature: z.number().min(0).max(2),
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
