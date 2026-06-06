import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { BatchReportSchema, type BatchReport } from "./batch";

/// An interrupted batch run the app found on disk (a leftover job log).
export const UnfinishedRunSchema = z.object({
  run_id: z.string(),
  collection_id: z.string(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type UnfinishedRun = z.infer<typeof UnfinishedRunSchema>;

/// On mount: is there an interrupted run to recover? `null` when none.
export async function checkUnfinishedRun(): Promise<UnfinishedRun | null> {
  const raw = await invoke("check_unfinished_run");
  return raw == null ? null : UnfinishedRunSchema.parse(raw);
}

/// Resume an interrupted run. The backend emits a one-shot partial `batch-complete`
/// to repaint the Matrix, then streams the live tail; the resolved value is the
/// final report.
export async function resumeBatchEval(runId: string): Promise<BatchReport> {
  return BatchReportSchema.parse(await invoke("resume_batch_eval", { runId }));
}

/// Throw away an interrupted run's recovery log.
export async function discardRun(runId: string): Promise<void> {
  await invoke("discard_run", { runId });
}
