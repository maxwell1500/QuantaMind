import { useCompareRun } from "../hooks/useCompareRun";
import { useCompareStore } from "../state/compareStore";

export function CompareToolbar() {
  const { isRunning, startError, start, cancelAll } = useCompareRun();
  const selectedCount = useCompareStore((s) => s.selectedModels.length);
  const prompt = useCompareStore((s) => s.prompt);
  const canRun = !isRunning && selectedCount > 0 && prompt.trim().length > 0;

  return (
    <div className="flex items-center gap-2" data-testid="compare-toolbar">
      {isRunning ? (
        <button
          type="button"
          onClick={() => void cancelAll()}
          className="text-sm border rounded px-3 py-1"
          data-testid="compare-cancel-all"
        >
          Cancel all
        </button>
      ) : (
        <button
          type="button"
          disabled={!canRun}
          onClick={() => void start("sequential")}
          className="text-sm border rounded px-3 py-1 disabled:opacity-50"
          data-testid="compare-run"
        >
          Run {selectedCount > 0 ? `(${selectedCount})` : ""}
        </button>
      )}
      {startError && (
        <span role="alert" className="text-xs text-red-600" data-testid="compare-start-error">
          {startError}
        </span>
      )}
    </div>
  );
}
