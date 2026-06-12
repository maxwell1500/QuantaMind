import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { BackendKind } from "../models/storage";
import type { ToolTask } from "./registry";
import type { InferenceParams } from "../workspace/prompts";

export const VerdictSchema = z.object({
  parsed: z.boolean(),
  tool_match: z.boolean(),
  args_match: z.boolean(),
  abstain_correct: z.boolean().nullable(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export const ToolTaskResultSchema = z.object({
  id: z.string(),
  category: z.string(),
  verdict: VerdictSchema,
  prompt_tokens: z.number().int().nonnegative().nullable().optional(),
});

export const ToolCallReportSchema = z.object({
  n: z.number().int().nonnegative(),
  parse_rate: z.number().nullable(),
  tool_selection_acc: z.number().nullable(),
  arg_acc: z.number().nullable(),
  abstain_acc: z.number().nullable(),
  composite: z.number().nullable(),
  /// Measured mean prompt-token depth for the run (real `prompt_eval_count`),
  /// or null when no task reported it — never an estimate.
  prompt_tokens: z.number().nullable(),
  per_task: z.array(ToolTaskResultSchema),
});
export type ToolCallReport = z.infer<typeof ToolCallReportSchema>;
export type ToolTaskResult = z.infer<typeof ToolTaskResultSchema>;

/// Run a tool-call reliability eval (prompt-based, single-turn, structural) over
/// the given tasks (built-in or custom) against a model on its backend. When a
/// `collectionId` is given, each task's full trace is cached under it so the
/// pipeline visualizer can show it later without re-running; pass "" (the
/// default) for probes that don't need a drill-down (context-cliff, quant sweep).
export async function runToolcallEval(
  model: string,
  backend: BackendKind,
  tasks: ToolTask[],
  collectionId = "",
  params?: InferenceParams,
): Promise<ToolCallReport> {
  return ToolCallReportSchema.parse(
    await invoke("run_toolcall_eval", { model, backend, collectionId, tasks, params }),
  );
}

/// The transparent trace of running ONE task: the exact system message sent, the
/// user prompt, the model's raw output, and the verdict — for the pipeline view.
export const TraceResultSchema = z.object({
  system_message: z.string(),
  user_prompt: z.string(),
  raw_output: z.string(),
  verdict: VerdictSchema,
  prompt_tokens: z.number().int().nonnegative().nullable().optional(),
});
export type TraceResult = z.infer<typeof TraceResultSchema>;

/// Trace a single task end-to-end against a model (real prompt + real output).
export async function traceToolcallTask(
  model: string,
  backend: BackendKind,
  task: ToolTask,
): Promise<TraceResult> {
  return TraceResultSchema.parse(await invoke("trace_toolcall_task", { model, backend, task }));
}

/// The cached trace for one (collection, model, task) from the last run, or null
/// if it was never run/saved — so the visualizer can show saved data with no
/// re-run, falling back to a live trace when absent.
export async function loadToolcallTrace(
  collectionId: string,
  model: string,
  taskId: string,
): Promise<TraceResult | null> {
  return TraceResultSchema.nullable().parse(
    await invoke("load_toolcall_trace", { collectionId, model, taskId }),
  );
}
