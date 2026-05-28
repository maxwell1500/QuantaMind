import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const UserSettingsSchema = z.object({
  theme: z.string().nullable().optional(),
  first_run_complete: z.boolean().default(false),
  last_update_check_at: z.string().nullable().optional(),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export async function getUserSettings(): Promise<UserSettings> {
  return UserSettingsSchema.parse(await invoke("get_user_settings"));
}

export async function setUserSettings(settings: UserSettings): Promise<void> {
  await invoke("set_user_settings", { settings });
}
