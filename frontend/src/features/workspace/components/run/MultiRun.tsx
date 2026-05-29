import { useCompareRun } from "../../../compare/hooks/useCompareRun";
import { useCompareStore } from "../../../compare/state/compareStore";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { CompareColumn } from "../../../compare/components/CompareColumn";

/// Multi-model run surface (2+ models, Ollama). Uses the one shared workspace
/// prompt and streams each model into a side-by-side column.
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
      <div className="flex items-center gap-2" data-testid="multi-toolbar">
        {isRunning ? (
          <button onClick={() => void cancelAll()} data-testid="multi-cancel"
            className="border rounded px-3 py-1 text-sm">Cancel all</button>
        ) : (
          <button disabled={!canRun} onClick={() => void run()} data-testid="multi-run"
            className="border rounded px-3 py-1 text-sm disabled:opacity-40">Compare ({count})</button>
        )}
        {startError && <span role="alert" className="text-xs text-red-600">{startError}</span>}
      </div>
      {rows.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" data-testid="compare-columns">
          {rows.map((r) => <CompareColumn key={r.model} row={r} />)}
        </div>
      )}
    </div>
  );
}
