import { RunControls } from "./RunControls";
import { RunOutput } from "./RunOutput";
import { useStreamingRun } from "../hooks/useStreamingRun";
import { useAutoRerun } from "../hooks/useAutoRerun";
import { useWorkspaceHotkeys } from "../hooks/useWorkspaceHotkeys";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { useNavStore } from "../../../shared/state/navStore";

/// Single-model run surface: run_prompt streaming with per-prompt params,
/// history recording, and auto-rerun. `model` is the one selected model.
export function SingleRun({ model }: { model: string | null }) {
  const current = useWorkspacesStore((s) => s.current);
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const patch = useWorkspacesStore((s) => s.patch);
  const save = useWorkspacesStore((s) => s.save);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const active = useNavStore((s) => s.topView) === "workspace";
  const { output, status, error, metrics, cancelledInfo, start, cancel } = useStreamingRun();

  const prompt = current?.user ?? "";
  const system = current?.system ?? "";
  const canRun = !!model && prompt.trim().length > 0;
  const runNow = () => model && start(model, prompt, system, current?.params, currentPath, current?.name);
  const { pending: pulsing } = useAutoRerun({
    enabled: !!current?.auto_rerun,
    selectionId: currentPath,
    runKey: JSON.stringify([prompt, system, current?.params, model]),
    status,
    canRun,
    onFire: runNow,
  });
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
        autoRerun={!!current?.auto_rerun}
        onToggleAutoRerun={() => patch({ auto_rerun: !current?.auto_rerun })}
        pulsing={pulsing}
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
