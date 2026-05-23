import { invoke } from "@tauri-apps/api/core";

export type CompareStrategy = "sequential" | "parallel" | "sequential_skippable";

export interface RunCompareArgs {
  models: string[];
  prompt: string;
  strategy: CompareStrategy;
}

export async function runCompare(args: RunCompareArgs): Promise<void> {
  await invoke("run_compare", { ...args });
}

export async function stopCompare(modelId?: string): Promise<void> {
  await invoke("stop_compare", { modelId: modelId ?? null });
}
