import { useCompareRun } from "../../../compare/hooks/useCompareRun";
import { useCompareStore } from "../../../compare/state/compareStore";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { RunStrategyPicker } from "../../../compare/components/RunStrategyPicker";
import { CompareColumn } from "../../../compare/components/CompareColumn";

/// Multi-model run surface (2+ models): run_compare across the selected
/// models using the current prompt, with strategy + RAM verdicts and
/// side-by-side columns. Per-prompt params don't apply here (run_compare
/// uses each model's saved temperature).
export function MultiRun() {
  const { isRunning, startError, start, cancelAll } = useCompareRun();
  const rows = useCompareStore((s) => s.rows);
  const setPrompt = useCompareStore((s) => s.setPrompt);
  const setSystemPrompt = useCompareStore((s) => s.setSystemPrompt);
  const count = useCompareStore((s) => s.selectedModels.length);
  const current = useWorkspacesStore((s) => s.current);
  const canRun = !isRunning && !!current && current.user.trim().length > 0;

  const run = async () => {
    if (current) { setPrompt(current.user); setSystemPrompt(current.system); }
    await start();
  };

  return (
    <div className="space-y-2">
      <RunStrategyPicker />
      <div className="flex items-center gap-2" data-testid="multi-toolbar">
        {isRunning ? (
          <button type="button" onClick={() => void cancelAll()} className="text-sm border rounded px-3 py-1" data-testid="multi-cancel">
            Cancel all
          </button>
        ) : (
          <button type="button" disabled={!canRun} onClick={() => void run()} className="text-sm bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-50" data-testid="multi-run">
            Compare ({count})
          </button>
        )}
        {startError && <span role="alert" className="text-xs text-red-600" data-testid="multi-start-error">{startError}</span>}
      </div>
      {rows.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" data-testid="compare-columns">
          {rows.map((r) => <CompareColumn key={r.model} row={r} />)}
        </div>
      )}
    </div>
  );
}
