import type { RunStatus } from "../hooks/useStreamingRun";

type Props = {
  status: RunStatus;
  canRun: boolean;
  ollamaHealthy?: boolean | null;
  onRun: () => void;
  onCancel: () => void;
};

export function RunControls({
  status,
  canRun,
  ollamaHealthy = true,
  onRun,
  onCancel,
}: Props) {
  const running = status === "running";
  const healthBlocked = ollamaHealthy === false;
  const runDisabled = running || !canRun || healthBlocked;
  const runTitle = healthBlocked && canRun && !running
    ? "Start Ollama first"
    : undefined;
  return (
    <div className="flex gap-2 items-center">
      <button
        type="button"
        onClick={onRun}
        disabled={runDisabled}
        title={runTitle}
        className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
      >
        Run
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={!running}
        className="px-3 py-1 rounded border text-sm disabled:opacity-50"
      >
        Cancel
      </button>
      <span className="text-xs text-gray-500" data-testid="run-status">
        {status}
      </span>
    </div>
  );
}
