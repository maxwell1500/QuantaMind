import { historyAppend } from "../../shared/ipc/history";
import type { InferenceParams } from "../../shared/ipc/prompts";
import { useHistoryStore } from "./state/historyStore";

export interface RunContext {
  model: string;
  prompt: string;
  system?: string;
  params?: InferenceParams;
  promptPath?: string | null;
}

/// Persist a completed run to per-workspace history, then refresh the
/// panel's list if it's open. Best-effort: a failure (e.g. no workspace
/// open) is logged, never surfaced as a run error.
export async function recordRun(ctx: RunContext | null, output: string, tokenCount: number) {
  if (!ctx || !output) return;
  try {
    await historyAppend({
      prompt_path: ctx.promptPath ?? null,
      model: ctx.model,
      system: ctx.system ?? "",
      user: ctx.prompt,
      params: ctx.params ?? {},
      output,
      token_count: tokenCount,
    });
    if (useHistoryStore.getState().open) await useHistoryStore.getState().load();
  } catch (e) {
    console.error("history append failed:", e);
  }
}
