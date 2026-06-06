import { useEffect, useState } from "react";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { useBackendStore } from "../../../shared/state/backendStore";
import { useBatchStore } from "../state/batchStore";
import { stopBatchEval } from "../../../shared/ipc/eval/batch";
import { EvalManager } from "./manager/EvalManager";
import { CollectionEditor } from "./manager/CollectionEditor";
import { MatrixScoreboard } from "./scoreboard/MatrixScoreboard";
import { PerformanceMatrix } from "./scoreboard/PerformanceMatrix";
import { TraceDebugger } from "./TraceDebugger";
import { RunRecoveryDialog } from "./RunRecoveryDialog";
import { useRunRecovery } from "../hooks/useRunRecovery";

/// The Automated-Pipeline Eval workspace. Left: the Eval Manager (collections +
/// run controls + authoring entry). Right: in run mode, the live Matrix Scoreboard
/// over the Trace Debugger; in edit mode, the Collection Editor (task list + Task &
/// Sandbox Configurator).
export function EvalPage() {
  const initRegistry = useEvalRegistryStore((s) => s.init);
  const startNew = useEvalRegistryStore((s) => s.startNew);
  const selectedCollection = useEvalRegistryStore((s) => s.selected);
  const allModels = useInstalledModelsStore((s) => s.list);
  const selectedBackend = useBackendStore((s) => s.selectedBackend);
  const models = allModels.filter((m) => m.backend === selectedBackend);
  const globalModel = useSelectedModelStore((s) => s.selectedModels[0] ?? null);

  const [targets, setTargets] = useState<string[]>([]);
  const [focusedModel, setFocusedModel] = useState<string>("");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [iterationsK, setIterationsK] = useState<number>(1);
  const [maxSteps, setMaxSteps] = useState<number>(8);
  const [editing, setEditing] = useState(false);
  const recovery = useRunRecovery();

  useEffect(() => {
    void initRegistry().catch(() => {});
  }, [initRegistry]);

  // On a backend switch, the last run's results + the chosen targets belong to the
  // PREVIOUS backend's models. A batch in flight is for the OLD backend, so actively
  // CANCEL it (a switch must not leave the old run streaming) before clearing —
  // `reset()` closes the store's event gate so any in-flight event is dropped, not
  // re-applied. Targets then re-seed from the new backend below.
  useEffect(() => {
    if (useBatchStore.getState().running) void stopBatchEval();
    useBatchStore.getState().reset();
    setTargets([]);
    setFocusedModel("");
  }, [selectedBackend]);

  // On a COLLECTION switch, the previous collection's per-(model,task) outcomes are
  // stale — a task id present in both collections would otherwise show the OLD
  // collection's Pass/Fail until a new batch runs. A batch in flight is scoring the
  // OLD collection, so cancel it too; `reset()` then closes the event gate so the
  // old run's late `task_done`/`batch-complete` events can't re-pollute the cleared
  // store under the new collection. Keep the targets (models are collection-free).
  useEffect(() => {
    if (useBatchStore.getState().running) void stopBatchEval();
    useBatchStore.getState().reset();
    setFocusedTaskId(null);
  }, [selectedCollection]);

  // Default one target once the model list loads — the global header model if
  // it's installed, else the first installed model.
  useEffect(() => {
    if (targets.length > 0) return;
    const seed = (globalModel && models.some((m) => m.name === globalModel.name))
      ? globalModel.name
      : models[0]?.name;
    if (seed) setTargets([seed]);
  }, [models, targets.length, globalModel]);

  // Keep the focused model (shown in the Simulator/Evaluator) inside the targets.
  useEffect(() => {
    if (targets.length > 0 && !targets.includes(focusedModel)) {
      setFocusedModel(targets[0]);
    }
  }, [targets, focusedModel]);

  // Robustness: once a run produces per-(model,task) outcomes, make sure the
  // focused model is one that actually has results — otherwise the Simulator /
  // Evaluator would read an empty key and show blank Steps/Result even though the
  // batch completed.
  const tasksByModel = useBatchStore((s) => s.tasksByModel);
  useEffect(() => {
    const withData = Object.keys(tasksByModel);
    if (withData.length > 0 && !withData.includes(focusedModel)) {
      setFocusedModel(withData[0]);
    }
  }, [tasksByModel, focusedModel]);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "360px 1fr" }} data-testid="eval-page">
      {recovery.pending && (
        <RunRecoveryDialog
          run={recovery.pending}
          onResume={() => void recovery.resume()}
          onDiscard={() => void recovery.discard()}
          onDismiss={recovery.dismiss}
        />
      )}
      <EvalManager
        targets={targets}
        setTargets={setTargets}
        k={iterationsK}
        setK={setIterationsK}
        maxSteps={maxSteps}
        setMaxSteps={setMaxSteps}
        onNewCollection={() => {
          startNew();
          setEditing(true);
        }}
        onEditCollection={() => setEditing(true)}
      />
      <div className="flex flex-col gap-4 min-w-0">
        {editing ? (
          <CollectionEditor onClose={() => setEditing(false)} />
        ) : (
          <>
            <MatrixScoreboard
              model={focusedModel}
              k={iterationsK}
              maxSteps={maxSteps}
              focusedTaskId={focusedTaskId}
              setFocusedTaskId={setFocusedTaskId}
            />
            <TraceDebugger model={focusedModel} taskId={focusedTaskId} setTaskId={setFocusedTaskId} />
            <PerformanceMatrix focusedModel={focusedModel} onFocusModel={setFocusedModel} />
          </>
        )}
      </div>
    </div>
  );
}
