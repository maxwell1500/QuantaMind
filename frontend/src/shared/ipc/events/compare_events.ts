import { z } from "zod";
import { GenerateStatsSchema, TokenTimingSchema } from "./events";

export const EVENT_COMPARE_TOKEN = "compare-token";
export const EVENT_COMPARE_DONE = "compare-done";
export const EVENT_COMPARE_CANCELLED = "compare-cancelled";
export const EVENT_COMPARE_ERROR = "compare-error";
export const EVENT_COMPARE_RUN_DONE = "compare-run-done";
export const EVENT_COMPARE_LOADING = "compare-loading";

export const CompareLoadingPayloadSchema = z.object({
  model_id: z.string().min(1),
  model: z.string().min(1),
});

export const CompareTokenPayloadSchema = z.object({
  model_id: z.string().min(1),
  model: z.string().min(1),
  text: z.string(),
});

export const CompareDonePayloadSchema = z.object({
  model_id: z.string().min(1),
  model: z.string().min(1),
  ttft_ms: z.number().nullable(),
  tokens_per_sec: z.number().nullable(),
  token_count: z.number().int().nonnegative(),
  timeline: z.array(TokenTimingSchema).default([]),
  stats: GenerateStatsSchema.optional(),
});

export const CompareCancelledPayloadSchema = z.object({
  model_id: z.string().min(1),
  model: z.string().min(1),
  token_count: z.number().int().nonnegative(),
});

export const CompareErrorPayloadSchema = z.object({
  model_id: z.string().min(1),
  model: z.string().min(1),
  kind: z.string().min(1),
  message: z.string(),
});

export type CompareTokenPayload = z.infer<typeof CompareTokenPayloadSchema>;
export type CompareDonePayload = z.infer<typeof CompareDonePayloadSchema>;
export type CompareCancelledPayload = z.infer<typeof CompareCancelledPayloadSchema>;
export type CompareErrorPayload = z.infer<typeof CompareErrorPayloadSchema>;
export type CompareLoadingPayload = z.infer<typeof CompareLoadingPayloadSchema>;
