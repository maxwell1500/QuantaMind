import { useEffect, useState } from "react";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { EvalManager } from "./manager/EvalManager";
import { CollectionEditor } from "./manager/CollectionEditor";
import { MatrixScoreboard } from "./scoreboard/MatrixScoreboard";
import { PerformanceMatrix } from "./scoreboard/PerformanceMatrix";
import { TraceDebugger } from "./TraceDebugger";

/// The Automated-Pipeline Eval workspace. Left: the Eval Manager (collections +
/// run controls + authoring entry). Right: in run mode, the live Matrix Scoreboard
/// over the Trace Debugger; in edit mode, the Collection Editor (task list + Task &
/// Sandbox Configurator).
export function EvalPage() {
  const initRegistry = useEvalRegistryStore((s) => s.init);
  const startNew = useEvalRegistryStore((s) => s.startNew);
  const models = useInstalledModelsStore((s) => s.list);

  const [targets, setTargets] = useState<string[]>([]);
  const [focusedModel, setFocusedModel] = useState<string>("");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [iterationsK, setIterationsK] = useState<number>(1);
  const [maxSteps, setMaxSteps] = useState<number>(8);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void initRegistry().catch(() => {});
  }, [initRegistry]);

  // Default one target once the model list loads.
  useEffect(() => {
    if (models.length > 0 && targets.length === 0) {
      setTargets([models[0].name]);
    }
  }, [models, targets.length]);

  // Keep the focused model (shown in the Simulator/Evaluator) inside the targets.
  useEffect(() => {
    if (targets.length > 0 && !targets.includes(focusedModel)) {
      setFocusedModel(targets[0]);
    }
  }, [targets, focusedModel]);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "360px 1fr" }} data-testid="eval-page">
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
