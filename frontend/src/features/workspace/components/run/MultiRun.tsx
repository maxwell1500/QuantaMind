import { useCompareRun } from "../../../compare/hooks/useCompareRun";
import { useCompareStore } from "../../../compare/state/compareStore";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useNavStore } from "../../../../shared/state/navStore";

/// Multi-model run trigger (2+ models, Ollama). Uses the one shared workspace
/// prompt; responses stream into the Analysis tab (we navigate there on Run).
export function MultiRun() {
  const { isRunning, startError, start, cancelAll } = useCompareRun();
  const setPrompt = useCompareStore((s) => s.setPrompt);
  const setSystemPrompt = useCompareStore((s) => s.setSystemPrompt);
  const count = useCompareStore((s) => s.selectedModels.length);
  const current = useWorkspacesStore((s) => s.current);
  const canRun = !isRunning && !!current && current.user.trim().length > 0;

  const run = () => {
    if (current) { setPrompt(current.user); setSystemPrompt(current.system); }
    useNavStore.getState().setTopView("analysis");
    void start();
  };

  return (
    <div className="flex items-center gap-2" data-testid="multi-toolbar">
      {isRunning ? (
        <button onClick={() => void cancelAll()} data-testid="multi-cancel"
          className="border rounded px-3 py-1 text-sm">Cancel all</button>
      ) : (
        <button disabled={!canRun} onClick={run} data-testid="multi-run"
          className="border rounded px-3 py-1 text-sm disabled:opacity-40">Compare ({count})</button>
      )}
      {startError && <span role="alert" className="text-xs text-red-600">{startError}</span>}
    </div>
  );
}
