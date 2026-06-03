import { useEffect } from "react";
import { RunControls } from "./RunControls";
import { useStreamingRun } from "../../hooks/useStreamingRun";
import { useWorkspaceHotkeys } from "../../hooks/useWorkspaceHotkeys";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useNavStore } from "../../../../shared/state/navStore";
import { useCompareStore } from "../../../compare/state/compareStore";
import { backendRunHint } from "../../state/runHint";

/// Single-model run trigger: run_prompt streaming with per-prompt params and
/// history. The response is shown on the Analysis tab — this mirrors the live
/// run into compareStore.rows and navigates there on Run.
export function SingleRun({ model }: { model: string | null }) {
  const current = useWorkspacesStore((s) => s.current);
  const currentPath = useWorkspacesStore((s) => s.currentPath);
  const save = useWorkspacesStore((s) => s.save);
  const saveDraftAuto = useWorkspacesStore((s) => s.saveDraftAuto);
  const ollamaHealthy = useWorkspaceStore((s) => s.ollamaHealthy);
  const llamaHealthy = useWorkspaceStore((s) => s.llamaHealthy);
  const mlxHealthy = useWorkspaceStore((s) => s.mlxHealthy);
  const activeBackend = useWorkspaceStore((s) => s.activeBackend);
  const setSingleRun = useCompareStore((s) => s.setSingleRun);
  const active = useNavStore((s) => s.topView) === "workspace";
  const { output, status, error, metrics, start, cancel } = useStreamingRun();

  useEffect(() => {
    if (status === "done") void saveDraftAuto();
  }, [status, saveDraftAuto]);

  // Mirror the live run into the rows the Analysis tab renders.
  useEffect(() => {
    if (status === "idle" || !model) return;
    setSingleRun({
      model, modelId: null, status, output, metrics,
      error: error ? { kind: "error", message: error } : null,
      startedAt: null, endedAt: null,
    });
  }, [status, output, metrics, error, model, setSingleRun]);

  const prompt = current?.user ?? "";
  const system = current?.system ?? "";
  // A backend is coupled to the model's weight format — no fallback. If the
  // active backend isn't healthy, Run is blocked with a "start it" hint.
  const blockedHint = backendRunHint(activeBackend, {
    ollama: ollamaHealthy,
    llama: llamaHealthy,
    mlx: mlxHealthy,
  });
  const canRun = !!model && prompt.trim().length > 0 && !blockedHint;
  const runNow = () => {
    if (!model) return;
    useNavStore.getState().setTopView("compare");
    void start(model, prompt, system, current?.params, currentPath, current?.name);
  };
  useWorkspaceHotkeys({
    active, canRun, running: status === "running", hasPrompt: !!current,
    onRun: runNow, onStop: cancel, onSave: () => void save(),
  });

  return (
    <RunControls
      status={status}
      canRun={canRun}
      blockedHint={blockedHint}
      onRun={runNow}
      onCancel={cancel}
    />
  );
}
