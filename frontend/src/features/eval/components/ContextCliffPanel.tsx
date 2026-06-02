import { useState } from "react";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useContextCliff } from "../hooks/useContextCliff";
import { cliffPoint } from "../cliff";
import { ContextCliffChart } from "./ContextCliffChart";

/// Context-Cliff probe: runs the selected dataset at growing prompt lengths and
/// graphs where tool-call accuracy collapses. Frontend-only, padding is
/// approximate (≈tokens) — labelled indicative, not a tokenizer.
export function ContextCliffPanel() {
  const list = useInstalledModelsStore((s) => s.list);
  const tasks = useEvalRegistryStore((s) => s.tasks);
  const [model, setModel] = useState("");
  const selected = list.find((m) => m.name === model);
  const { points, running, run } = useContextCliff(selected?.name ?? "", selected?.backend ?? "ollama", tasks);
  const cliff = cliffPoint(points);

  return (
    <div className="space-y-2 border-t pt-3" data-testid="cliff-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Context-cliff probe</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          data-testid="cliff-model-select"
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">Select a model…</option>
          {list.map((m) => (
            <option key={m.name} value={m.name}>{m.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selected || running || tasks.length === 0}
          onClick={() => void run()}
          data-testid="cliff-run"
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {running ? "Probing…" : "Run probe"}
        </button>
        <span className="text-[11px] text-gray-400">grows the prompt with filler · ≈tokens (approx)</span>
      </div>
      {points.length > 0 && (
        <>
          <p className="text-xs text-gray-700" data-testid="cliff-read">
            {cliff != null
              ? `Tool-call accuracy holds, then drops around ≈${cliff} context tokens (approx).`
              : "No accuracy collapse detected across the tested range."}
          </p>
          <ContextCliffChart points={points} width={520} height={150} />
        </>
      )}
    </div>
  );
}
