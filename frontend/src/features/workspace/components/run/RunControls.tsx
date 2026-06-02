import type { RunStatus } from "../../hooks/useStreamingRun";

type Props = {
  status: RunStatus;
  canRun: boolean;
  // Set when the active backend isn't healthy — blocks Run and explains why.
  blockedHint?: string | null;
  onRun: () => void;
  onCancel: () => void;
};

export function RunControls({
  status,
  canRun,
  blockedHint,
  onRun,
  onCancel,
}: Props) {
  const running = status === "running";
  const blocked = !!blockedHint;
  const runDisabled = running || !canRun || blocked;
  const runTitle = blocked && canRun && !running ? (blockedHint ?? undefined) : undefined;
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
      {runTitle && (
        <span className="text-xs text-amber-700" data-testid="run-blocked-hint">{runTitle}</span>
      )}
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
