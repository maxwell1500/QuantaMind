import type { GenerateStats } from "../../../shared/ipc/events/events";

export type TtftSegmentKey = "load" | "prefill" | "remainder";
export interface TtftSegment {
  key: TtftSegmentKey;
  label: string;
  ms: number;
}
export interface TtftBreakdown {
  segments: TtftSegment[];
  total: number;
  available: boolean; // false = backend reported neither load nor prefill
  promptTokens: number | null;
}

/// Decompose a measured TTFT into Model load + Prompt prefill (server-reported)
/// + Network/first-token (the remainder). Only segments backed by real data are
/// emitted; `available` is false when the backend reported nothing — the UI
/// then shows "not available" rather than a fabricated single bar. Pure.
export function buildTtftSegments(
  ttftMs: number | null,
  stats: GenerateStats | undefined,
): TtftBreakdown {
  const load = stats?.load_ms ?? null;
  const prefill = stats?.prompt_eval_ms ?? null;
  const promptTokens = stats?.prompt_eval_count ?? null;
  const available = load != null || prefill != null;
  if (!available) {
    return { segments: [], total: ttftMs ?? 0, available: false, promptTokens };
  }
  const segments: TtftSegment[] = [];
  if (load != null) segments.push({ key: "load", label: "Model load", ms: load });
  if (prefill != null) segments.push({ key: "prefill", label: "Prompt prefill", ms: prefill });
  if (ttftMs != null) {
    const remainder = Math.max(0, ttftMs - (load ?? 0) - (prefill ?? 0));
    segments.push({ key: "remainder", label: "Network + first token", ms: remainder });
  }
  const total = segments.reduce((s, x) => s + x.ms, 0);
  return { segments, total, available: true, promptTokens };
}
