import { useEffect, useRef, useState } from "react";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { useBackendStore } from "../../../shared/state/backendStore";
import { useBatchStore } from "../state/batchStore";
import { useCliffStore } from "../state/cliffStore";
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
  const selectedBackend = useBackendStore((s) => s.selectedBackend);
  const selectedModels = useSelectedModelStore((s) => s.selectedModels);

  // The eval runs ONE model, chosen from the global selection (single source of truth) —
  // no per-page picker. EvalManager's dropdown sets this.
  const [evalModel, setEvalModel] = useState<string>("");
  const [focusedModel, setFocusedModel] = useState<string>("");
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  // The per-model detail panels live above the Performance Matrix; a row click
  // scrolls them into view so the inspect action is tangible even for one model.
  const detailRef = useRef<HTMLDivElement>(null);
  const focusModel = (m: string) => {
    setFocusedModel(m);
    detailRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const [iterationsK, setIterationsK] = useState<number>(1);
  const [maxSteps, setMaxSteps] = useState<number>(8);
  const [editing, setEditing] = useState(false);
  const recovery = useRunRecovery();

  useEffect(() => {
    void initRegistry().catch((e) => console.error("eval registry init failed (EvalPage):", e));
  }, [initRegistry]);

  // Context-shift cancellation law: a backend OR collection switch invalidates the
  // target of every long-running process, so ALL compute for the old context halts.
  // The cliff probe (which survives plain tab navigation by design) is stopped here
  // too — not just the batch — so a switch never leaves the GPU grinding an
  // abandoned ladder. `cliffStore.stop()` bumps its generation token, so no further
  // rungs dispatch and the abandoned run never persists.
  const haltOldContext = () => {
    if (useBatchStore.getState().running) void stopBatchEval();
    useBatchStore.getState().reset();
    useCliffStore.getState().stop();
  };

  // On a backend switch the last run's results + chosen targets belong to the OLD
  // backend's models — halt + clear, then targets re-seed from the new backend below.
  useEffect(() => {
    haltOldContext();
    setFocusedModel("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBackend]);

  // On a collection switch the previous collection's per-(model,task) outcomes are
  // stale — a shared task id would otherwise show the OLD collection's Pass/Fail
  // until a new batch runs. Halt + clear (the event gate drops any late events);
  // keep the targets (models are collection-free).
  useEffect(() => {
    haltOldContext();
    setFocusedTaskId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCollection]);

  // Keep the eval model a valid member of the GLOBAL selection — default the first;
  // reset if it leaves (a backend switch trims the selection to the new backend).
  useEffect(() => {
    if (selectedModels.some((m) => m.name === evalModel)) return;
    setEvalModel(selectedModels[0]?.name ?? "");
  }, [selectedModels, evalModel]);

  // The detail panels (Simulator/Evaluator/Trace) show the single eval model.
  useEffect(() => {
    if (evalModel) setFocusedModel(evalModel);
  }, [evalModel]);

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
        model={evalModel}
        setModel={setEvalModel}
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
            <div ref={detailRef}>
              <MatrixScoreboard
                model={focusedModel}
                k={iterationsK}
                maxSteps={maxSteps}
                focusedTaskId={focusedTaskId}
                setFocusedTaskId={setFocusedTaskId}
              />
            </div>
            <TraceDebugger model={focusedModel} taskId={focusedTaskId} setTaskId={setFocusedTaskId} />
            <PerformanceMatrix focusedModel={focusedModel} onFocusModel={focusModel} />
          </>
        )}
      </div>
    </div>
  );
}
