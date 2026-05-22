export const EVENT_TOKEN = "prompt-token";
export const EVENT_DONE = "prompt-done";
export const EVENT_CANCELLED = "prompt-cancelled";

export type TokenPayload = { text: string };

export type DonePayload = {
  ttft_ms: number | null;
  tokens_per_sec: number | null;
  token_count: number;
};

export type CancelledPayload = { token_count: number };
