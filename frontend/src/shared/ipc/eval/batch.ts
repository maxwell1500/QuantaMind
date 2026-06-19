import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { BackendKindSchema } from "../models/storage";
import { ToolCallReportSchema, TraceResultSchema } from "./toolcall";
import type { ModelTarget } from "./matrix";
import type { ToolTask } from "./registry";
import type { InferenceParams } from "../workspace/prompts";
import type { Tier } from "./readiness";

export const EVENT_BATCH_PROGRESS = "batch-progress";
export const EVENT_AGENTIC_STEP = "agentic-step";
export const EVENT_BATCH_COMPLETE = "batch-complete";

export const StepKindSchema = z.enum([
  "tool_call",
  "tool_error",
  "unknown_tool",
  "schema_error",
  "malformed_json",
  "hallucinated_completion",
  "end_state_reached",
  "infinite_loop",
  "forbidden_call",
  "turn_timeout",
]);
export type StepKind = z.infer<typeof StepKindSchema>;

export const TrajectoryStepSchema = z.object({
  run_index: z.number().int(),
  step_index: z.number().int(),
  raw_output: z.string(),
  injection: z.string().nullable(),
  kind: StepKindSchema,
});
export type TrajectoryStep = z.infer<typeof TrajectoryStepSchema>;

export const TopErrorSchema = z.enum([
  "none",
  "infinite_loop",
  "hallucinated",
  "malformed_json",
  "malformed_schema",
  "forbidden_call",
  "turn_timeout",
]);
export type TopError = z.infer<typeof TopErrorSchema>;

export const FailureTrackerSchema = z.object({
  infinite_loop_hits: z.number().int(),
  hallucinated_completions: z.number().int(),
  malformed_json_calls: z.number().int(),
  schema_unrecovered_calls: z.number().int(),
  // Phase 9 / 9B: decoy distraction, must_not_call traps, and per-step timeouts — added
  // to the tracker after the original four. `.optional()` so pre-9B reports (and existing
  // typed fixtures) still parse; consumers treat an absent count as 0.
  unknown_tool_calls: z.number().int().optional(),
  forbidden_calls: z.number().int().optional(),
  turn_timeouts: z.number().int().optional(),
});
export type FailureTracker = z.infer<typeof FailureTrackerSchema>;

export const AgenticReportSchema = z.object({
  passes: z.number().int(),
  total_runs: z.number().int(),
  failures: FailureTrackerSchema,
  avg_output_tokens_success: z.number().nullable(),
  avg_steps: z.number().nullable(),
  top_error: TopErrorSchema,
  schema_resilience: z.number().nullable(),
});
export type AgenticReport = z.infer<typeof AgenticReportSchema>;

/// Per-model aggregate across the collection's agentic tasks. Null metrics render
/// "N/A"/"—" — never a fabricated number.
export const AggAgenticSchema = z.object({
  // Strict Pass^k (spec §3.3): tasks whose every k run passed, over total tasks.
  // `.default(0)` mirrors the Rust `#[serde(default)]` so pre-fix reports still parse.
  tasks_passed: z.number().int().default(0),
  tasks_total: z.number().int().default(0),
  // Run-level sums — the secondary per-run rate (pass@k), NOT the headline.
  passes: z.number().int(),
  total_runs: z.number().int(),
  avg_steps: z.number().nullable(),
  avg_output_tokens_success: z.number().nullable(),
  schema_resilience: z.number().nullable(),
  top_error: TopErrorSchema,
  // Summed failure breakdown — the readiness verdict gates on the exact loop /
  // hallucination counts, which `top_error` alone would hide. `.default` mirrors
  // the Rust `#[serde(default)]` so pre-Phase-7 reports still parse.
  failures: FailureTrackerSchema.default({
    infinite_loop_hits: 0,
    hallucinated_completions: 0,
    malformed_json_calls: 0,
    schema_unrecovered_calls: 0,
  }),
});
export type AggAgentic = z.infer<typeof AggAgenticSchema>;

export const BatchColumnSchema = z.object({
  model: z.string(),
  backend: BackendKindSchema,
  toolcall: ToolCallReportSchema.nullable(),
  agentic: AggAgenticSchema.nullable(),
  // Phase 7.2: parallel native function-calling aggregate (Ollama /api/chat
  // tool_calls), when measured. Nullish so pre-7.2 reports still parse.
  agentic_native_fc: AggAgenticSchema.nullish(),
  error: z.string().nullable(),
});
export type BatchColumn = z.infer<typeof BatchColumnSchema>;

export const BatchReportSchema = z.object({
  collection_id: z.string(),
  columns: z.array(BatchColumnSchema),
  // The run's context length, when set — basis for the readiness VRAM-fit KV-cache
  // estimate. Nullish so reports saved before Phase 7.4 still parse.
  num_ctx: z.number().int().nullish(),
});
export type BatchReport = z.infer<typeof BatchReportSchema>;

/// One task's outcome (the `batch-progress` Done payload, cached for the trace
/// debugger): a single-turn trace, an agentic report, or an error.
export const TaskOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single"), passed: z.boolean(), trace: TraceResultSchema }),
  z.object({ kind: z.literal("agentic"), report: AgenticReportSchema }),
  z.object({ kind: z.literal("error"), message: z.string() }),
]);
export type TaskOutcome = z.infer<typeof TaskOutcomeSchema>;

/// The `batch-progress` event: a task started (carries `total`) or finished.
export const BatchProgressSchema = z.discriminatedUnion("phase", [
  z.object({
    phase: z.literal("started"),
    model: z.string(),
    task_id: z.string(),
    index: z.number().int(),
    total: z.number().int(),
    category: z.string(),
  }),
  z.object({ phase: z.literal("done"), model: z.string(), task_id: z.string(), outcome: TaskOutcomeSchema }),
]);
export type BatchProgress = z.infer<typeof BatchProgressSchema>;

/// The `agentic-step` event: a live turn tagged with its (model, task).
export const AgenticStepPayloadSchema = TrajectoryStepSchema.extend({
  model: z.string(),
  task_id: z.string(),
});
export type AgenticStepPayload = z.infer<typeof AgenticStepPayloadSchema>;

export const BatchCompletePayloadSchema = z.object({ report: BatchReportSchema });

/// The one streaming eval command. Returns the final report (also delivered via
/// the `batch-complete` event); progress arrives on `batch-progress` /
/// `agentic-step`. K / Max-Steps override the per-task agentic spec at run time.
/// `tier` (Phase 9) stamps the difficulty tier + derived Pass^k onto each agentic
/// spec (an explicit `k` still wins — the Custom path); `decoyTools` injects the
/// anti-saturation decoy budget. Both `undefined` preserves pre-Phase-9 behavior.
export async function runBatchEval(
  collectionId: string,
  targets: ModelTarget[],
  tasks: ToolTask[],
  k?: number,
  maxSteps?: number,
  params?: InferenceParams,
  keepAlive?: number,
  runNativeFc?: boolean,
  tier?: Tier,
  decoyTools?: number,
): Promise<BatchReport> {
  return BatchReportSchema.parse(
    await invoke("run_batch_eval", {
      collectionId,
      targets,
      tasks,
      k,
      maxSteps,
      params,
      keepAlive,
      runNativeFc,
      tier,
      decoyTools,
    }),
  );
}

export async function stopBatchEval(): Promise<void> {
  await invoke("stop_batch_eval");
}
