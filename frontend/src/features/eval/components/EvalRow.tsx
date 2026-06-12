import type { EvalTask, EvalRunResult } from "../../../shared/ipc/eval/evals";

function badge(running: boolean, result: EvalRunResult | null): { text: string; cls: string } {
  if (running) return { text: "Running…", cls: "text-gray-500" };
  if (result == null) return { text: "—", cls: "text-gray-400" };
  return result.passed ? { text: "Pass", cls: "text-green-600" } : { text: "Fail", cls: "text-red-600" };
}

/// One eval task row: id, category, pass/fail, and the scorer's detail.
export function EvalRow({
  task,
  result,
  running,
}: {
  task: EvalTask;
  result: EvalRunResult | null;
  running: boolean;
}) {
  const b = badge(running, result);
  return (
    <div className="flex items-center gap-2 border-t py-1 text-xs" data-testid={`eval-row-${task.id}`}>
      <span className="w-44 truncate font-mono">{task.id}</span>
      <span className="w-24 text-gray-500">{task.category}</span>
      <span className={`w-16 font-medium ${b.cls}`} data-testid={`eval-status-${task.id}`}>{b.text}</span>
      {result && <span className="flex-1 truncate text-gray-400">{result.detail}</span>}
    </div>
  );
}
