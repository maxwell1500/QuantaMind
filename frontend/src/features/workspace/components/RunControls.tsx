import type { RunStatus } from "../hooks/useStreamingRun";

type Props = {
  status: RunStatus;
  canRun: boolean;
  ollamaHealthy?: boolean | null;
  onRun: () => void;
  onCancel: () => void;
  autoRerun?: boolean;
  onToggleAutoRerun?: () => void;
  pulsing?: boolean;
};

export function RunControls({
  status,
  canRun,
  ollamaHealthy = true,
  onRun,
  onCancel,
  autoRerun = false,
  onToggleAutoRerun,
  pulsing = false,
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
        data-pulsing={pulsing || undefined}
        className={`px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50 ${
          pulsing ? "animate-pulse ring-2 ring-blue-300" : ""
        }`}
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
      {onToggleAutoRerun && (
        <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer" title="Re-run automatically 800ms after you stop typing">
          <input
            type="checkbox"
            checked={autoRerun}
            onChange={onToggleAutoRerun}
            data-testid="auto-rerun-toggle"
          />
          Auto-rerun on save
        </label>
      )}
      <span className="text-xs text-gray-500" data-testid="run-status">
        {status}
      </span>
    </div>
  );
}
