import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

/// Record one model's measured context-cliff depth for a collection. The backend
/// stores keys verbatim (Ollama names carry colons) and writes atomically.
export async function saveCliffResult(collectionId: string, model: string, cliffTokens: number): Promise<void> {
  await invoke("save_cliff_result", { collectionId, model, cliffTokens: Math.round(cliffTokens) });
}

/// The collection's measured cliff depths, keyed by the RAW model name. Zod
/// `record` preserves keys exactly — no sanitizing — so they match the Matrix's
/// raw `model` strings.
const CliffResultsSchema = z.record(z.string(), z.number().int().nonnegative());

export async function getCliffResults(collectionId: string): Promise<Record<string, number>> {
  return CliffResultsSchema.parse(await invoke("get_cliff_results", { collectionId }));
}
