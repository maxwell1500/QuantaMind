import type { ToolTask } from "../../shared/ipc/eval/registry";

/// The display reconstruction of an agentic task's system package — the per-run
/// prompt isn't persisted, so both the Evaluator's "System Prompt Pkg" tab and the
/// scoreboard's per-run Input drill-down rebuild it from the task's tool schemas.
/// One source of truth so the two views can never silently diverge.
///
/// NOTE: this is the INSTRUCTED tool set only. At run time the backend may merge in
/// synthetic decoy tools (when the Decoys budget > 0); callers that know the decoy
/// count surface that separately (the model saw more than this).
export function agenticSystemPreview(task: ToolTask): string {
  return `Constructed agentic prompt package for tools:\n${JSON.stringify(task.tools, null, 2)}`;
}
