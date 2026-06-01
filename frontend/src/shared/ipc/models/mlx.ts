import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { InstalledModelInfoSchema, type InstalledModelInfo } from "./storage";

/// Models a running mlx_lm.server has loaded (via its OpenAI `/v1/models`).
/// Empty off Apple Silicon or when no server is running — never an error.
export async function listMlxModels(): Promise<InstalledModelInfo[]> {
  const raw = await invoke("list_mlx_models");
  return z.array(InstalledModelInfoSchema).parse(raw);
}
