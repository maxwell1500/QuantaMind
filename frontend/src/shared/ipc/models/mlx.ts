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

/// Download an MLX repo's full snapshot to local disk (~/.quantamind/mlx). It
/// then appears via listMlxModels. Progress streams over the shared
/// `EVENT_HF_PROGRESS` bus and cancel goes through `cancelHfInstall` — MLX and
/// GGUF installs share one in-flight slot (one at a time).
export async function installMlxModel(repo: string): Promise<void> {
  await invoke("install_mlx_model", { repo });
}
