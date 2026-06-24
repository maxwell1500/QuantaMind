import { historyAppend } from "../../shared/ipc/workspace/history";
import type { InferenceParams } from "../../shared/ipc/workspace/prompts";
import { useHistoryStore } from "./state/historyStore";

export interface RunContext {
  name?: string;
  model: string;
  prompt: string;
  system?: string;
  params?: InferenceParams;
  promptPath?: string | null;
}

/// Persist a completed run to per-workspace history, then refresh the
/// panel's list if it's open. Best-effort: a failure (e.g. no workspace
/// open) is logged, never surfaced as a run error.
export interface RunMetrics {
  token_count: number;
  ttft_ms?: number | null;
  tokens_per_sec?: number | null;
  load_ms?: number | null;
}

export async function recordRun(ctx: RunContext | null, output: string, metrics: RunMetrics) {
  if (!ctx || !output) return;
  try {
    await historyAppend({
      name: ctx.name ?? "",
      prompt_path: ctx.promptPath ?? null,
      model: ctx.model,
      system: ctx.system ?? "",
      user: ctx.prompt,
      params: ctx.params ?? {},
      output,
      token_count: metrics.token_count,
      ttft_ms: metrics.ttft_ms ?? null,
      tokens_per_sec: metrics.tokens_per_sec ?? null,
      load_ms: metrics.load_ms ?? null,
    });
    if (useHistoryStore.getState().open) await useHistoryStore.getState().load();
  } catch (e) {
    console.error("history append failed:", e);
  }
}
