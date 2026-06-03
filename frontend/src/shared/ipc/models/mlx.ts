import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { InstalledModelInfoSchema, type InstalledModelInfo } from "./storage";

/// MLX models discovered on local disk (downloaded into ~/.quantamind/mlx).
/// Present as soon as downloaded — no running server required. Empty off Apple
/// Silicon — never an error.
export async function listMlxModels(): Promise<InstalledModelInfo[]> {
  const raw = await invoke("list_mlx_models");
  return z.array(InstalledModelInfoSchema).parse(raw);
}
