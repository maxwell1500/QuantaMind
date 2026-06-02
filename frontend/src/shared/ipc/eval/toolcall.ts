import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { BackendKind } from "../models/storage";
import type { ToolTask } from "./registry";

export const VerdictSchema = z.object({
  parsed: z.boolean(),
  tool_match: z.boolean(),
  args_match: z.boolean(),
  abstain_correct: z.boolean().nullable(),
});

export const ToolTaskResultSchema = z.object({
  id: z.string(),
  category: z.string(),
  verdict: VerdictSchema,
});

export const ToolCallReportSchema = z.object({
  n: z.number().int().nonnegative(),
  parse_rate: z.number().nullable(),
  tool_selection_acc: z.number().nullable(),
  arg_acc: z.number().nullable(),
  abstain_acc: z.number().nullable(),
  composite: z.number().nullable(),
  per_task: z.array(ToolTaskResultSchema),
});
export type ToolCallReport = z.infer<typeof ToolCallReportSchema>;
export type ToolTaskResult = z.infer<typeof ToolTaskResultSchema>;

/// Run a tool-call reliability eval (prompt-based, single-turn, structural) over
/// the given tasks (built-in or custom) against a model on its backend.
export async function runToolcallEval(
  model: string,
  backend: BackendKind,
  tasks: ToolTask[],
): Promise<ToolCallReport> {
  return ToolCallReportSchema.parse(await invoke("run_toolcall_eval", { model, backend, tasks }));
}
