import { useCompareRun } from "../../hooks/useCompareRun";
import { useCompareStore } from "../../state/compareStore";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useSelectedModelStore } from "../../../../shared/state/selectedModelStore";
import { useNavStore } from "../../../../shared/state/navStore";

/// Multi-model run trigger (2+ models, shown in the Workspace). Uses the authored
/// prompt + the global inference params; on Run it navigates to the Analysis tab
/// where the responses stream into columns. Backend per model is resolved in
/// useCompareRun.
export function MultiRun() {
  const { isRunning, startError, start, cancelAll } = useCompareRun();
  const setPrompt = useCompareStore((s) => s.setPrompt);
  const setSystemPrompt = useCompareStore((s) => s.setSystemPrompt);
  const count = useSelectedModelStore((s) => s.selectedModels.length);
  const current = useWorkspacesStore((s) => s.current);
  const canRun = !isRunning && !!current && current.user.trim().length > 0 && count > 0;

  const run = () => {
    if (current) {
      setPrompt(current.user);
      setSystemPrompt(current.system);
    }
    useNavStore.getState().setTopView("compare");
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
      {!current && <span className="text-xs text-gray-500">Author a prompt in the Workspace first.</span>}
      {startError && <span role="alert" className="text-xs text-red-600">{startError}</span>}
    </div>
  );
}
