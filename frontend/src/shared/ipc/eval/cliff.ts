import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { CliffStatusSchema, type CliffStatus } from "./readiness";
import { BackendKindSchema, type BackendKind } from "../models/storage";
import type { ToolTask } from "./registry";
import type { InferenceParams } from "../workspace/prompts";

/// Live per-rung progress from the backend cliff engine.
export const EVENT_CLIFF_PROGRESS = "cliff-progress";

/// Which embedded synthetic preset pads the probe (or the user's own text).
export const CliffPresetSchema = z.enum(["corporate_policy", "system_logs", "financial_ledger"]);
export type CliffPreset = z.infer<typeof CliffPresetSchema>;
export type CliffSource = { kind: "preset"; preset: CliffPreset } | { kind: "text"; text: string };

/// One needle position within a rung (backend `DepthScore`).
export const DepthScoreSchema = z.object({
  depth: z.number(),
  composite: z.number().nullable(),
  verified_tokens: z.number().int(),
});

/// The raw completion behind one FAILED probe position (backend `FailureSample`) —
/// what the model actually emitted, so a Broken/collapsed rung explains itself.
export const FailureSampleSchema = z.object({
  task_id: z.string(),
  depth: z.number(),
  output: z.string(),
});
export type FailureSample = z.infer<typeof FailureSampleSchema>;

/// One ladder rung (backend `CliffPoint`): requested vs VERIFIED depth, the
/// worst-position composite, and the per-position breakdown.
export const CliffRungSchema = z.object({
  target_tokens: z.number().int(),
  verified_tokens: z.number().int(),
  composite: z.number().nullable(),
  per_depth: z.array(DepthScoreSchema),
  /// Raw completions for the failing tasks at this rung (capped, may be empty).
  samples: z.array(FailureSampleSchema).default([]),
});
export type CliffRung = z.infer<typeof CliffRungSchema>;

/// The probe result (backend `CliffReport`): every rung, the classified status,
/// and `cliff_tokens` — the largest verified context that still passed.
export const CliffReportSchema = z.object({
  points: z.array(CliffRungSchema),
  status: CliffStatusSchema,
  cliff_tokens: z.number().int().nullable(),
});
export type CliffReport = z.infer<typeof CliffReportSchema>;

/// The `cliff-progress` event: the rung that just finished, with done/total.
export const CliffProgressSchema = z.object({
  model: z.string(),
  done: z.number().int(),
  total: z.number().int(),
  point: CliffRungSchema,
});
export type CliffProgress = z.infer<typeof CliffProgressSchema>;

/// Run the context-cliff probe in the backend engine: pad each task to a ladder of
/// VERIFIED token depths, sweep the needle across mid-document positions, and report
/// where tool-call accuracy collapses. The classified outcome is persisted backend-side
/// (so the Matrix/verdict read it later); the full report drives the live chart.
export async function runContextCliff(
  model: string,
  backend: BackendKind,
  collectionId: string,
  tasks: ToolTask[],
  source: CliffSource,
  maxTokens: number,
  steps: number,
  params?: InferenceParams,
): Promise<CliffReport> {
  return CliffReportSchema.parse(
    await invoke("run_context_cliff", { model, backend, collectionId, tasks, source, maxTokens: Math.round(maxTokens), steps, params }),
  );
}

// Re-export so callers building a source picker get the backend kind locally.
export type { BackendKind };
export { BackendKindSchema };

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
