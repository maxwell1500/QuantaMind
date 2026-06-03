import { useEffect, useState } from "react";
import { useEvalRegistryStore } from "../../eval/state/evalRegistryStore";
import { useBatchStore } from "../../eval/state/batchStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";
import { loadCollectionHistory, type RunSummary } from "../../../shared/ipc/eval/matrix";
import { HistoryTimeline } from "../../eval/components/matrix/HistoryTimeline";
import { ContextCliffPanel } from "../../eval/components/ContextCliffPanel";
import { batchToCsv, download } from "../../eval/exportBatch";

const exportBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "#94a3b8",
  fontSize: 12,
  fontFamily: "Inter,sans-serif",
  cursor: "pointer",
};
const card: React.CSSProperties = {
  background: "linear-gradient(145deg, #1a1f2e 0%, #161b27 100%)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  padding: 16,
};

/// The Audit tab (Zone 2 — compliance home): the saved Performance-Matrix
/// regression history, the audit-trail export of the latest batch run, and the
/// Context-Cliff diagnostic probe (moved off the Eval workspace).
export function AuditPage() {
  const { presets, collections, init } = useEvalRegistryStore();
  const report = useBatchStore((s) => s.report);
  const models = useInstalledModelsStore((s) => s.list);
  const [collection, setCollection] = useState("curated");
  const [history, setHistory] = useState<RunSummary[]>([]);

  useEffect(() => {
    void init().catch(() => {});
  }, [init]);

  useEffect(() => {
    let cancelled = false;
    loadCollectionHistory(collection)
      .then((h) => !cancelled && setHistory(h))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
  }, [collection]);

  return (
    <section data-testid="tab-audit" className="space-y-4">
      <h2 className="text-lg font-semibold">Audit &amp; Compliance</h2>

      <div style={card} data-testid="audit-history">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", fontFamily: "Inter,sans-serif" }}>Saved Matrix History</span>
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            data-testid="audit-collection"
            style={{ ...exportBtn, color: "#e2e8f0" }}
          >
            {presets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            {collections.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            disabled={!report}
            onClick={() => report && download("audit-trail.csv", batchToCsv(report, models), "text/csv")}
            style={{ ...exportBtn, opacity: report ? 1 : 0.5, cursor: report ? "pointer" : "not-allowed" }}
            data-testid="audit-export-csv"
          >
            ⭳ Export Audit Trail (CSV)
          </button>
          <button
            type="button"
            disabled={!report}
            onClick={() => report && download("audit-trail.json", JSON.stringify(report, null, 2), "application/json")}
            style={{ ...exportBtn, opacity: report ? 1 : 0.5, cursor: report ? "pointer" : "not-allowed" }}
            data-testid="audit-export-json"
          >
            ⭳ JSON
          </button>
        </div>
        <HistoryTimeline history={history} />
      </div>

      <ContextCliffPanel />
    </section>
  );
}
