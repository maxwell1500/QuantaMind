import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

/// Record one model's context-cliff outcome for a collection. `depth` = the collapse
/// depth (tokens) when a cliff was found, or `null` when accuracy held — in which case
/// `tested` is how far the probe reached ("✓ No cliff (≥tested)"). The backend stores
/// keys verbatim (Ollama names carry colons) and writes atomically.
export async function saveCliffResult(
  collectionId: string,
  model: string,
  depth: number | null,
  tested: number,
): Promise<void> {
  await invoke("save_cliff_result", {
    collectionId,
    model,
    depth: depth == null ? null : Math.round(depth),
    tested: Math.round(tested),
  });
}

/// The collection's measured cliff depths, keyed by the RAW model name. Zod
/// `record` preserves keys exactly — no sanitizing — so they match the Matrix's
/// raw `model` strings.
const CliffResultsSchema = z.record(z.string(), z.number().int().nonnegative());

export async function getCliffResults(collectionId: string): Promise<Record<string, number>> {
  return CliffResultsSchema.parse(await invoke("get_cliff_results", { collectionId }));
}
