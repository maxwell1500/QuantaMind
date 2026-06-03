import { useEffect, useState } from "react";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { EvalManager } from "./manager/EvalManager";
import { CollectionEditor } from "./manager/CollectionEditor";
import { MatrixScoreboard } from "./scoreboard/MatrixScoreboard";
import { TraceDebugger } from "./TraceDebugger";

/// The Automated-Pipeline Eval workspace. Left: the Eval Manager (collections +
/// run controls + authoring entry). Right: in run mode, the live Matrix Scoreboard
/// over the Trace Debugger; in edit mode, the Collection Editor (task list + Task &
/// Sandbox Configurator).
export function EvalPage() {
  const initRegistry = useEvalRegistryStore((s) => s.init);
  const startNew = useEvalRegistryStore((s) => s.startNew);
  const models = useInstalledModelsStore((s) => s.list);

  const [selectedModel, setSelectedModel] = useState<string>("");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [iterationsK, setIterationsK] = useState<number>(1);
  const [maxSteps, setMaxSteps] = useState<number>(8);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void initRegistry().catch(() => {});
  }, [initRegistry]);

  // Default the target model once the list loads.
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      setSelectedModel(models[0].name);
    }
  }, [models, selectedModel]);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "360px 1fr" }} data-testid="eval-page">
      <EvalManager
        model={selectedModel}
        setModel={setSelectedModel}
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
              model={selectedModel}
              k={iterationsK}
              maxSteps={maxSteps}
              focusedTaskId={focusedTaskId}
              setFocusedTaskId={setFocusedTaskId}
            />
            <TraceDebugger model={selectedModel} taskId={focusedTaskId} setTaskId={setFocusedTaskId} />
          </>
        )}
      </div>
    </div>
  );
}
