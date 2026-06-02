import { useState } from "react";
import { runToolcallEval, type ToolCallReport } from "../../../shared/ipc/eval/toolcall";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { servesModelsByName, SINGLE_MODEL_NOTE } from "../../../shared/models/backendSupport";

const pct = (v: number | null) => (v == null ? "n/a" : `${Math.round(v * 100)}%`);
const mark = (b: boolean) => (b ? "✓" : "✗");

function Metric({ label, v, bold }: { label: string; v: number | null; bold?: boolean }) {
  return (
    <span className={bold ? "font-semibold" : ""}>
      <span className="text-gray-400">{label} </span>
      {pct(v)}
    </span>
  );
}

/// Tool-calling reliability eval: parse / tool-selection / args / abstention +
/// composite, plus a per-task table. Prompt-based, single-turn, structural —
/// labelled indicative. "Not available" on backend error; never fabricated.
export function ToolCallPanel() {
  const list = useInstalledModelsStore((s) => s.list);
  const [model, setModel] = useState("");
  const [report, setReport] = useState<ToolCallReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = list.find((m) => m.name === model);
  const run = async () => {
    if (!selected) return;
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      setReport(await runToolcallEval(selected.name, selected.backend));
    } catch (e) {
      setError(formatIpcError(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2 border-t pt-3" data-testid="toolcall-panel">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Tool-calling reliability</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          data-testid="toolcall-model-select"
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
          onClick={() => void run()}
          data-testid="toolcall-run"
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {running ? "Running…" : "Run"}
        </button>
        <span className="text-[11px] text-gray-400">prompt-based · single-turn · structural — indicative</span>
      </div>
      {selected && !servesModelsByName(selected.backend) && (
        <p className="text-[11px] text-amber-700" data-testid="toolcall-single-model-note">{SINGLE_MODEL_NOTE}</p>
      )}
      {error && (
        <p className="text-xs text-red-600" data-testid="toolcall-error">Not available — {error}</p>
      )}
      {report && (
        <>
          <div className="flex gap-3 text-sm" data-testid="toolcall-scores">
            <Metric label="Composite" v={report.composite} bold />
            <Metric label="Parse" v={report.parse_rate} />
            <Metric label="Tool" v={report.tool_selection_acc} />
            <Metric label="Args" v={report.arg_acc} />
            <Metric label="Abstain" v={report.abstain_acc} />
          </div>
          <table className="text-xs w-full border-collapse" data-testid="toolcall-table">
            <thead>
              <tr className="text-left text-gray-500"><th>Task</th><th>Category</th><th>Parse</th><th>Tool</th><th>Args</th></tr>
            </thead>
            <tbody>
              {report.per_task.map((t) => (
                <tr key={t.id} className="border-t" data-testid={`toolcall-row-${t.id}`}>
                  <td className="py-1 pr-2 font-mono">{t.id}</td>
                  <td className="py-1 pr-2 text-gray-500">{t.category}</td>
                  {t.category === "abstain" ? (
                    <td className="py-1 pr-2" colSpan={3}>
                      {t.verdict.abstain_correct ? "✓ abstained" : "✗ called anyway"}
                    </td>
                  ) : (
                    <>
                      <td className="py-1 pr-2">{mark(t.verdict.parsed)}</td>
                      <td className="py-1 pr-2">{mark(t.verdict.tool_match)}</td>
                      <td className="py-1 pr-2">{mark(t.verdict.args_match)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
