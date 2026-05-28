import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const RECOMMENDED_MODEL = "llama3.2:1b";

/// Create ~/Documents/QuantaMind with a welcome prompt; returns the root.
export async function scaffoldOnboardingWorkspace(): Promise<string> {
  return z.string().parse(await invoke("scaffold_onboarding_workspace"));
}

export async function pullModel(name: string): Promise<string> {
  return z.string().parse(await invoke("pull_model", { name }));
}
