import { invoke } from "@tauri-apps/api/core";

/// Download an MLX repo's full snapshot to local disk (~/.quantamind/mlx). It
/// then appears as an installed MLX model. Progress streams over the shared
/// `EVENT_HF_PROGRESS` bus and cancel goes through `cancelHfInstall` — MLX and
/// GGUF installs share one in-flight slot (one at a time).
export async function installMlxModel(repo: string): Promise<void> {
  await invoke("install_mlx_model", { repo });
}
