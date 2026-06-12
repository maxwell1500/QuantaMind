import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { type ModelVerdict } from "../eval/readiness";

const PublishMetricsSchema = z.object({
  pass_k: z.number(),
  effort: z.number().optional(),
  avg_steps: z.number().optional(),
});

export const PublishRowSchema = z.object({
  model: z.string(),
  quant: z.string(),
  cohort_key: z.string(),
  tool_version: z.string(),
  metrics: PublishMetricsSchema,
});
export type PublishRow = z.infer<typeof PublishRowSchema>;

/// The exact payload preview the privacy gate shows: metrics-only rows, the
/// deterministic canonical JSON + integrity hash, the derived cohort, how many
/// models were dropped as unmeasured, and any local validation failure (mirror of
/// the Rust `PublishPreview`).
export const PublishPreviewSchema = z.object({
  rows: z.array(PublishRowSchema),
  canonical_json: z.string(),
  hash: z.string(),
  cohort_key: z.string(),
  excluded_count: z.number(),
  invalid: z.object({ index: z.number(), reason: z.string() }).nullable(),
});
export type PublishPreview = z.infer<typeof PublishPreviewSchema>;

/// Build the publish payload preview from the current verdicts. Offline + read-only
/// — derives the cohort from the local hardware snapshot and sends nothing.
export async function previewPublishPayload(verdicts: ModelVerdict[]): Promise<PublishPreview> {
  return PublishPreviewSchema.parse(await invoke("preview_publish_payload", { verdicts }));
}
