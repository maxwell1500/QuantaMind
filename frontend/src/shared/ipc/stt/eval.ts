import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { ReadinessSchema } from "../eval/readiness";

/// An eval task — a text instruction set joined to a stored transcript by id.
/// `reference` null → behavioral-only (WER N/A); `critical_tokens` drive weighted WER.
export const SttEvalTaskSchema = z.object({
  id: z.string(),
  reference: z.string().nullable().default(null),
  critical_tokens: z.array(z.string()).default([]),
});
export type SttEvalTask = z.infer<typeof SttEvalTaskSchema>;

export const SttEvalSpecSchema = z.object({ tasks: z.array(SttEvalTaskSchema) });
export type SttEvalSpec = z.infer<typeof SttEvalSpecSchema>;

export const MisreadSchema = z.object({ reference: z.string(), heard: z.string(), probability: z.number() });

export const WerResultSchema = z.object({
  wer: z.number(),
  weighted_wer: z.number(),
  adjusted_wer: z.number(),
  substitutions: z.number(),
  insertions: z.number(),
  deletions: z.number(),
  ref_words: z.number(),
  critical_token_accuracy: z.number().nullable(),
  misreads: z.array(MisreadSchema),
});
export type WerResult = z.infer<typeof WerResultSchema>;

/// One scored (model, task) row. Every metric nullable → "N/A"; `wer` null when
/// the task had no reference (accuracy unverified).
export const SttReportRowSchema = z.object({
  task_id: z.string(),
  model: z.string(),
  rtf: z.number().nullable(),
  repeat_rate: z.number().nullable(),
  silence_rate: z.number().nullable(),
  confidence: z.number().nullable(),
  wer: WerResultSchema.nullable(),
});
export type SttReportRow = z.infer<typeof SttReportRowSchema>;

export const SttReportSchema = z.object({ rows: z.array(SttReportRowSchema) });
export type SttReport = z.infer<typeof SttReportSchema>;

export const SttReadinessProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  min_rtf: z.number().nullable(),
  max_wer: z.number().nullable(),
  max_repeat_rate: z.number().nullable(),
  max_silence_rate: z.number().nullable(),
  min_confidence: z.number().nullable(),
  require_vram_fit: z.boolean(),
});
export type SttReadinessProfile = z.infer<typeof SttReadinessProfileSchema>;

export const SttReadinessVerdictSchema = z.object({
  status: ReadinessSchema,
  blocking: z.array(z.string()),
  conditions: z.array(z.string()),
});

export const SttModelVerdictSchema = z.object({
  model: z.string(),
  verdict: SttReadinessVerdictSchema,
  rtf: z.number().nullable(),
  wer: z.number().nullable(),
  weighted_wer: z.number().nullable(),
  repeat_rate: z.number().nullable(),
  silence_rate: z.number().nullable(),
  confidence: z.number().nullable(),
  memory: z.unknown().nullable(),
});
export type SttModelVerdict = z.infer<typeof SttModelVerdictSchema>;

/// Run an eval spec against the stored transcripts → a scored report.
export async function runSttEval(spec: string): Promise<SttReport> {
  return SttReportSchema.parse(await invoke("run_stt_eval", { spec }));
}
export async function listSttEvals(): Promise<string[]> {
  return z.array(z.string()).parse(await invoke("list_stt_evals"));
}
export async function loadSttEval(name: string): Promise<SttEvalSpec> {
  return SttEvalSpecSchema.parse(await invoke("load_stt_eval", { name }));
}
export async function saveSttEval(name: string, spec: SttEvalSpec): Promise<void> {
  await invoke("save_stt_eval", { name, spec });
}
export async function deleteSttEval(name: string): Promise<void> {
  await invoke("delete_stt_eval", { name });
}
export async function loadSttReport(spec: string): Promise<SttReport | null> {
  return SttReportSchema.nullable().parse(await invoke("load_stt_report", { spec }));
}
export async function assessSttReadiness(spec: string, profileId: string): Promise<SttModelVerdict[]> {
  return z.array(SttModelVerdictSchema).parse(await invoke("assess_stt_readiness", { spec, profileId }));
}
export async function listSttReadinessProfiles(): Promise<SttReadinessProfile[]> {
  return z.array(SttReadinessProfileSchema).parse(await invoke("list_stt_readiness_profiles"));
}
export async function saveSttReadinessProfile(profile: SttReadinessProfile): Promise<void> {
  await invoke("save_stt_readiness_profile", { profile });
}
export async function deleteSttReadinessProfile(id: string): Promise<void> {
  await invoke("delete_stt_readiness_profile", { id });
}
