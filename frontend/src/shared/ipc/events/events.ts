import { z } from "zod";

export const EVENT_TOKEN = "prompt-token";
export const EVENT_DONE = "prompt-done";
export const EVENT_CANCELLED = "prompt-cancelled";

export const TokenPayloadSchema = z.object({
  text: z.string(),
});

// Per-token timing entry: text, ms since run start, 1-based cumulative count.
export const TokenTimingSchema = z.object({
  text: z.string(),
  t_ms: z.number().int().nonnegative(),
  n: z.number().int().positive(),
});

export const DonePayloadSchema = z.object({
  ttft_ms: z.number().nullable(),
  tokens_per_sec: z.number().nullable(),
  token_count: z.number().int().nonnegative(),
  timeline: z.array(TokenTimingSchema),
});

export const CancelledPayloadSchema = z.object({
  token_count: z.number().int().nonnegative(),
});

export type TokenPayload = z.infer<typeof TokenPayloadSchema>;
export type TokenTiming = z.infer<typeof TokenTimingSchema>;
export type DonePayload = z.infer<typeof DonePayloadSchema>;
export type CancelledPayload = z.infer<typeof CancelledPayloadSchema>;
