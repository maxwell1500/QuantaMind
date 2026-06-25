import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

/// Mirrors the Rust vision OCR `VisionReport` (a SEPARATE family — never a leaderboard verdict).
export const OcrMetricsSchema = z.object({
  cer: z.number(),
  wer: z.number(),
  substitutions: z.number().int(),
  insertions: z.number().int(),
  deletions: z.number().int(),
  ref_words: z.number().int(),
  critical_token_accuracy: z.number().nullable(),
});
export type OcrMetrics = z.infer<typeof OcrMetricsSchema>;

export const VisionStatusSchema = z.enum(["scored", "cannot_process", "empty_output", "hallucinated"]);
export type VisionStatus = z.infer<typeof VisionStatusSchema>;

export const VisionReportRowSchema = z.object({
  task_id: z.string(),
  model: z.string(),
  status: VisionStatusSchema,
  // `null` for cannot_process / empty_output — never a fabricated 0.
  metrics: OcrMetricsSchema.nullable(),
  extracted: z.string(),
  ground_truth: z.string(),
  image_b64: z.string(),
});
export type VisionReportRow = z.infer<typeof VisionReportRowSchema>;

export const VisionReportSchema = z.object({
  collection_id: z.string(),
  model: z.string(),
  rows: z.array(VisionReportRowSchema),
});
export type VisionReport = z.infer<typeof VisionReportSchema>;

export async function runVisionEval(collectionId: string, model: string): Promise<VisionReport> {
  return VisionReportSchema.parse(await invoke("run_vision_eval", { collectionId, model }));
}
