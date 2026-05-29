import { useCompareRun } from "../../../compare/hooks/useCompareRun";
import { useCompareStore } from "../../../compare/state/compareStore";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useRegisterRun } from "../../hooks/useRegisterRun";
import { CompareColumn } from "../../../compare/components/CompareColumn";

/// Multi-model run surface (2+ models, Ollama). Uses the one shared workspace
/// prompt and streams each model into a side-by-side column. The Run/Stop
/// trigger lives in the header (registered via useRegisterRun).
export function MultiRun() {
  const { isRunning, startError, start, cancelAll } = useCompareRun();
  const rows = useCompareStore((s) => s.rows);
  const setPrompt = useCompareStore((s) => s.setPrompt);
  const setSystemPrompt = useCompareStore((s) => s.setSystemPrompt);
  const current = useWorkspacesStore((s) => s.current);
  const canRun = !!current && current.user.trim().length > 0;

  const run = () => {
    if (current) { setPrompt(current.user); setSystemPrompt(current.system); }
    void start();
  };
  useRegisterRun(isRunning, canRun, run, () => void cancelAll());

  return (
    <div className="space-y-2">
      {startError && <span role="alert" className="text-xs text-red-600">{startError}</span>}
      {rows.length > 0 && (
        <div className="flex gap-2 overflow-x-auto" data-testid="compare-columns">
          {rows.map((r) => <CompareColumn key={r.model} row={r} />)}
        </div>
      )}
    </div>
  );
}
