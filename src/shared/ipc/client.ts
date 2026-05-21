import { invoke } from "@tauri-apps/api/core";

export async function listModels(): Promise<string[]> {
  return invoke<string[]>("list_models");
}
