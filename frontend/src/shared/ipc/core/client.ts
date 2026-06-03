import { invoke } from "@tauri-apps/api/core";
import type { HealthStatus } from "./types";

export async function listModels(): Promise<string[]> {
  return invoke<string[]>("list_models");
}

export async function checkOllamaHealth(): Promise<HealthStatus> {
  return invoke<HealthStatus>("check_ollama_health");
}

export async function checkMlxHealth(): Promise<HealthStatus> {
  return invoke<HealthStatus>("check_mlx_health");
}
