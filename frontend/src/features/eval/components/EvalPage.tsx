import { useEffect, useState } from "react";
import { useEvalRegistryStore } from "../state/evalRegistryStore";
import { useBatchStore } from "../state/batchStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { EvalManager } from "./manager/EvalManager";
import { MatrixScoreboard } from "./scoreboard/MatrixScoreboard";
import { TraceDebugger } from "./TraceDebugger";
import { batchToCsv, download } from "../exportBatch";

const exportBtn: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#94a3b8",
  fontSize: 12,
  fontFamily: "Inter,sans-serif",
  cursor: "pointer",
};

/// The Automated-Pipeline Eval workspace: three panes — the Eval Manager (left,
/// authoring), the live Matrix Scoreboard (top-right, the central per-model
/// artifact), and the Trace Debugger (bottom-right). Clicking a model row in the
/// scoreboard reveals that model's run trace inline below — the always-visible
/// debug loop. An audit-trail export sits above the matrix.
export function EvalPage() {
  const initRegistry = useEvalRegistryStore((s) => s.init);
  const report = useBatchStore((s) => s.report);
  const models = useInstalledModelsStore((s) => s.list);
  const [focusModel, setFocusModel] = useState<string | null>(null);

  useEffect(() => {
    void initRegistry().catch(() => {});
  }, [initRegistry]);

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(360px, 420px) 1fr" }} data-testid="eval-page">
      <EvalManager />
      <div className="flex flex-col gap-4 min-w-0">
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            disabled={!report}
            onClick={() => report && download("audit-trail.csv", batchToCsv(report, models), "text/csv")}
            style={{ ...exportBtn, opacity: report ? 1 : 0.5, cursor: report ? "pointer" : "not-allowed" }}
            data-testid="export-csv"
          >
            ⭳ Export Audit Trail (CSV)
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={() => report && download("audit-trail.json", JSON.stringify(report, null, 2), "application/json")}
            style={{ ...exportBtn, opacity: report ? 1 : 0.5, cursor: report ? "pointer" : "not-allowed" }}
            data-testid="export-json"
          >
            ⭳ JSON
          </button>
        </div>
        <MatrixScoreboard onFocus={setFocusModel} />
        <TraceDebugger model={focusModel} />
      </div>
    </div>
  );
}
