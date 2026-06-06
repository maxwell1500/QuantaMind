import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { CliffStatusSchema, type CliffStatus } from "./readiness";

/// Record one model's context-cliff outcome for a collection. `broken` ⇒ fails at the
/// baseline; else `depth` = the collapse depth (tokens), or `null` when accuracy held —
/// in which case `tested` is how far the probe reached ("✓ No cliff (≥tested)"). The
/// backend stores keys verbatim (Ollama names carry colons) and writes atomically.
export async function saveCliffResult(
  collectionId: string,
  model: string,
  depth: number | null,
  tested: number,
  broken: boolean,
): Promise<void> {
  await invoke("save_cliff_result", {
    collectionId,
    model,
    depth: depth == null ? null : Math.round(depth),
    tested: Math.round(tested),
    broken,
  });
}

/// The collection's full per-model cliff STATUS (collapse depth / no-cliff / broken /
/// not-probed), keyed by the RAW model name. Zod `record` preserves keys exactly — no
/// sanitizing — so they match the Matrix's raw `model` strings.
const CliffResultsSchema = z.record(z.string(), CliffStatusSchema);

export async function getCliffResults(collectionId: string): Promise<Record<string, CliffStatus>> {
  return CliffResultsSchema.parse(await invoke("get_cliff_results", { collectionId }));
}
