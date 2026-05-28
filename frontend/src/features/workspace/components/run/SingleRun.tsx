import { useEffect } from "react";
import { RunControls } from "./RunControls";
import { RunOutput } from "./RunOutput";
import { useStreamingRun } from "../../hooks/useStreamingRun";
import { useWorkspaceHotkeys } from "../../hooks/useWorkspaceHotkeys";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useNavStore } from "../../../../shared/state/navStore";

/// Single-model run surface: run_prompt streaming with per-prompt params
/// and history recording. `model` is the one selected model.
export function SingleRun({ model }: { model: string | null }) {
  const current = useWorkspacesStore((s) => s.current);
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const save = useWorkspacesStore((s) => s.save);
  const saveDraftAuto = useWorkspacesStore((s) => s.saveDraftAuto);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const active = useNavStore((s) => s.topView) === "workspace";
  const { output, status, error, metrics, cancelledInfo, start, cancel } = useStreamingRun();

  // A successful run on an unsaved draft auto-saves it into the workspace.
  useEffect(() => {
    if (status === "done") void saveDraftAuto();
  }, [status, saveDraftAuto]);

  const prompt = current?.user ?? "";
  const system = current?.system ?? "";
  const canRun = !!model && prompt.trim().length > 0;
  const runNow = () => model && start(model, prompt, system, current?.params, currentPath, current?.name);
  useWorkspaceHotkeys({
    active, canRun, running: status === "running", hasPrompt: !!current,
    onRun: runNow, onStop: cancel, onSave: () => void save(),
  });

  return (
    <>
      <RunControls
        status={status}
        canRun={canRun}
        ollamaHealthy={ollamaHealthy}
        onRun={runNow}
        onCancel={cancel}
      />
      <RunOutput
        output={output}
        status={status}
        metrics={metrics}
        cancelledInfo={cancelledInfo}
        error={error}
        onRetry={runNow}
      />
    </>
  );
}
