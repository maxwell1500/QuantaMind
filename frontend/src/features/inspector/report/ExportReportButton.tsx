import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { useCompareStore } from "../../compare/state/compareStore";
import { getHardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import { loadedModels } from "../../../shared/ipc/system/vram";
import { historyList } from "../../../shared/ipc/workspace/history";
import { saveCompareReport } from "../../../shared/ipc/compare/compare";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { buildInspectorHtml } from "./reportHtml";

/// Export the Inspector's data as a single self-contained HTML report. Gathers
/// hardware + loaded-model VRAM + run history on demand, builds the document,
/// and writes it to a user-chosen path.
export function ExportReportButton() {
  const [error, setError] = useState<string | null>(null);

  const exportHtml = async () => {
    setError(null);
    const path = await save({
      defaultPath: `quantamind-inspector-${Date.now()}.html`,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (!path) return;
    try {
      const [hardware, loaded, history] = await Promise.all([
        getHardwareSnapshot().catch(() => null),
        loadedModels(),
        historyList().catch(() => []),
      ]);
      const html = buildInspectorHtml({
        rows: useCompareStore.getState().rows,
        hardware,
        vramByName: new Map(loaded.map((m) => [m.name, m])),
        history,
        generatedAtIso: new Date().toISOString(),
      });
      await saveCompareReport(path, "html", html);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void exportHtml()}
        className="text-xs text-blue-600 hover:text-blue-800"
        data-testid="export-report"
      >
        Export report
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600" data-testid="export-report-error">
          {error}
        </span>
      )}
    </span>
  );
}
