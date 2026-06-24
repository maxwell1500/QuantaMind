import { useEffect } from "react";
import { useCompareStore } from "../../compare/state/compareStore";
import { useNavStore } from "../../../shared/state/navStore";
import { useParentWidth } from "../hooks/useParentWidth";
import { useLoadedModels } from "../hooks/useLoadedModels";
import { useRunHistory } from "../hooks/useRunHistory";
import { useHardware, deviceMemory } from "../hooks/useHardware";
import { pickLoaded } from "../format/vram";
import { ModelTimeline } from "./ModelTimeline";
import { LeakBanner } from "./LeakBanner";
import { ExportReportButton } from "../report/ExportReportButton";
import { SttInspectorSection } from "../../sttInspector/components/SttInspectorSection";
import { useSttResultStore } from "../../sttInspector/state/sttResultStore";

// Per-token event colours (the latency bars) and the run-phase colours (the
// breakdown track + the chart's vertical phase lines). Disjoint palettes so a
// colour means one thing across both charts.
const SWATCH = [
  { kind: "ttft", label: "TTFT", color: "#d97706" },
  { kind: "normal", label: "Token gap", color: "#2563eb" },
  { kind: "outlier", label: "Outlier (latency spike)", color: "#dc2626" },
];
const PHASE_SWATCH = [
  { label: "Model load", color: "#64748b" },
  { label: "Prompt prefill", color: "#7c3aed" },
  { label: "Generation", color: "#16a34a" },
];

/// Inspector view: per-token timing for the last run, one labeled chart per
/// model (x = token index, y = latency since the previous token). Reads the
/// compare rows, which hold both single runs (mirrored) and multi-model runs.
export function InspectorPage() {
  const rows = useCompareStore((s) => s.rows);
  const topView = useNavStore((s) => s.topView);
  const [ref, width] = useParentWidth<HTMLDivElement>();
  const { byName, refresh } = useLoadedModels();
  const { entries, refresh: refreshHistory } = useRunHistory();
  const hw = useHardware();
  const dev = deviceMemory(hw);
  // The page is always mounted (hidden tab), so re-read /api/ps + history each
  // time the Inspector is opened — the model that just ran is loaded by then.
  useEffect(() => {
    if (topView === "inspector") {
      void refresh();
      void refreshHistory();
    }
  }, [topView, refresh, refreshHistory]);
  const charted = rows.filter((r) => (r.metrics?.timeline?.length ?? 0) > 0);
  const hasStt = useSttResultStore((s) => s.result != null);

  if (charted.length === 0 && !hasStt) {
    return (
      <div className="text-sm text-gray-500 border rounded p-6 text-center" data-testid="inspector-empty" ref={ref}>
        Run a prompt — or transcribe audio — in the Workspace to inspect timing.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="inspector" ref={ref}>
      <LeakBanner />
      {charted.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              <span className="text-gray-400">Phases:</span>
              {PHASE_SWATCH.map((s) => (
                <span key={s.label} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
              <span className="text-gray-400 ml-1">Tokens:</span>
              {SWATCH.map((s) => (
                <span key={s.kind} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => void refresh()}
                className="text-xs text-blue-600 hover:text-blue-800" data-testid="vram-refresh">
                Refresh VRAM
              </button>
              <ExportReportButton />
            </div>
          </div>
          {charted.map((row) => (
            <ModelTimeline key={row.model} row={row} width={width} vram={pickLoaded(byName, row.model)}
              history={entries} deviceTotalBytes={dev.totalBytes} unified={dev.unified} hw={hw} />
          ))}
        </>
      )}
      <SttInspectorSection width={width} />
    </div>
  );
}
