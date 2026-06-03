import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { BackendKindSchema, type BackendKind } from "../models/storage";

export const EvalTaskSchema = z.object({
  id: z.string(),
  category: z.string(),
  prompt: z.string(),
  // `scoring` is opaque to the UI — the backend owns scoring.
  scoring: z.unknown(),
});
export type EvalTask = z.infer<typeof EvalTaskSchema>;

export const EvalRunResultSchema = z.object({
  task_id: z.string(),
  category: z.string(),
  passed: z.boolean(),
  detail: z.string(),
  output: z.string(),
  token_count: z.number().int().nonnegative(),
});
export type EvalRunResult = z.infer<typeof EvalRunResultSchema>;

/// The bundled eval tasks.
export async function listEvals(): Promise<EvalTask[]> {
  return z.array(EvalTaskSchema).parse(await invoke("list_evals"));
}

/// Run one task against a model on a backend; returns the scored result.
export async function runEvalTask(
  taskId: string,
  model: string,
  backend: BackendKind,
): Promise<EvalRunResult> {
  const raw = await invoke("run_eval_task", { taskId, model, backend });
  return EvalRunResultSchema.parse(raw);
}

// Re-export for callers that need the backend type alongside eval calls.
export { BackendKindSchema };
