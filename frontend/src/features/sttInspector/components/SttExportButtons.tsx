import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { saveCompareReport } from "../../../shared/ipc/compare/compare";
import { formatIpcError } from "../../../shared/ipc/core/error";
import { useSttResultStore } from "../state/sttResultStore";
import { toSttMarkdown, toSttJson } from "../format/sttReport";

const LABEL: Record<"md" | "json", string> = { md: "MD", json: "JSON" };

/// Export the last transcript's metrics + segments as Markdown or JSON. Reuses the
/// generic save_compare_report file-writer (md/json/html).
export function SttExportButtons() {
  const [error, setError] = useState<string | null>(null);
  const result = useSttResultStore((s) => s.result);
  const disabled = result == null;

  const exportAs = async (format: "md" | "json") => {
    setError(null);
    const t = useSttResultStore.getState().result;
    if (!t) return;
    const path = await save({
      defaultPath: `quantamind-transcript-${t.id}.${format}`,
      filters: [{ name: LABEL[format], extensions: [format] }],
    });
    if (!path) return;
    const contents = format === "md" ? toSttMarkdown(t) : toSttJson(t);
    try {
      await saveCompareReport(path, format, contents);
    } catch (e) {
      setError(formatIpcError(e));
    }
  };

  return (
    <div className="flex items-center gap-2" data-testid="stt-export-buttons">
      <button type="button" disabled={disabled} onClick={() => void exportAs("md")}
        className="text-sm border rounded px-3 py-1 disabled:opacity-50" data-testid="stt-export-md">
        Export Markdown
      </button>
      <button type="button" disabled={disabled} onClick={() => void exportAs("json")}
        className="text-sm border rounded px-3 py-1 disabled:opacity-50" data-testid="stt-export-json">
        Export JSON
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-600" data-testid="stt-export-error">{error}</span>
      )}
    </div>
  );
}
