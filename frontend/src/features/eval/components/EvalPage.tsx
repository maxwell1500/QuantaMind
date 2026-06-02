import { useEffect, useState } from "react";
import { listEvals } from "../../../shared/ipc/eval/evals";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useEvalStore, passRate } from "../state/evalStore";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useEvalRun } from "../hooks/useEvalRun";
import { EvalRow } from "./EvalRow";
import { ToolCallPanel } from "./ToolCallPanel";
import { DatasetBar } from "./DatasetBar";
import { servesModelsByName, SINGLE_MODEL_NOTE } from "../../../shared/models/backendSupport";

/// The Eval tab: run the bundled deterministic eval suite against an installed
/// model and see a pass-rate + per-task pass/fail. A quality *smoke test*, not a
/// rigorous benchmark.
export function EvalPage() {
  const tasks = useEvalStore((s) => s.tasks);
  const results = useEvalStore((s) => s.results);
  const running = useEvalStore((s) => s.running);
  const currentId = useEvalStore((s) => s.currentId);
  const error = useEvalStore((s) => s.error);
  const setTasks = useEvalStore((s) => s.setTasks);
  const list = useInstalledModelsStore((s) => s.list);
  const status = useInstalledModelsStore((s) => s.status);
  const refresh = useInstalledModelsStore((s) => s.refresh);
  const [model, setModel] = useState("");
  const { run } = useEvalRun();
  const initRegistry = useEvalRegistryStore((s) => s.init);

  useEffect(() => {
    listEvals().then(setTasks).catch(() => {});
  }, [setTasks]);
  useEffect(() => {
    void initRegistry().catch(() => {});
  }, [initRegistry]);
  useEffect(() => {
    if (status === "idle") void refresh();
  }, [status, refresh]);

  const selected = list.find((m) => m.name === model);
  const { passed, total } = passRate(results);

  return (
    <div className="space-y-3" data-testid="eval-page">
      <div className="flex items-center gap-2">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          data-testid="eval-model-select"
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">Select a model…</option>
          {list.map((m) => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selected || running}
          onClick={() => selected && void run(selected.name, selected.backend)}
          data-testid="eval-run"
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {running ? "Running…" : "Run evals"}
        </button>
        {total > 0 && (
          <span data-testid="eval-passrate" className="text-sm font-medium">
            {passed}/{total} · {Math.round((passed / total) * 100)}%
          </span>
        )}
      </div>
      {selected && !servesModelsByName(selected.backend) && (
        <p className="text-[11px] text-amber-700" data-testid="eval-single-model-note">{SINGLE_MODEL_NOTE}</p>
      )}
      {error && (
        <p className="text-xs text-red-600" data-testid="eval-error">{error}</p>
      )}
      <div>
        {tasks.map((t) => (
          <EvalRow key={t.id} task={t} result={results[t.id] ?? null} running={running && currentId === t.id} />
        ))}
      </div>
      <div className="border-t pt-3 space-y-2">
        <DatasetBar />
        <ToolCallPanel />
      </div>
    </div>
  );
}
