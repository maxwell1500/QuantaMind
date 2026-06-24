import type { DonePayload } from "../../shared/ipc/events/events";

export function formatMetrics(m: DonePayload): string {
  const ttft = m.ttft_ms ?? "—";
  const tps = m.tokens_per_sec?.toFixed(1) ?? "—";
  return `TTFT ${ttft}ms · ${tps} tok/s · ${m.token_count} tokens`;
}
