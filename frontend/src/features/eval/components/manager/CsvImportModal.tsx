import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextCapped } from "../../../../shared/ipc/eval/registry";
import { formatIpcError } from "../../../../shared/ipc/core/error";
import { useNavStore } from "../../../../shared/state/navStore";
import type { ToolTask } from "../../../../shared/ipc/eval/registry";
import { csvToCollection, EXPECTED_HEADER } from "../../csvImport";

const TOOLS_TEMPLATE = JSON.stringify(
  [
    {
      name: "get_weather",
      description: "Get the current weather for a city",
      parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
    },
  ],
  null,
  2,
);

const EXAMPLE_ROWS = [
  { id: "weather-paris", prompt: "What's the weather in Paris?", tool: "get_weather", args: '{"city":"Paris"}' },
  { id: "refuse-greet", prompt: "Say hello", tool: "(empty → abstain)", args: "(empty)" },
];

const RAW_EXAMPLE =
  `${EXPECTED_HEADER.join(",")}\n` +
  `weather-paris,"What's the weather in Paris?",get_weather,"{""city"":""Paris""}"\n` +
  `refuse-greet,"Say hello",,`;

function stemOf(path: string): string {
  return (path.split(/[\\/]/).pop() ?? "").replace(/\.csv$/i, "");
}

/// The rich CSV-import modal: teaches the strict format (example table + raw
/// block), takes a shared Tools schema + a pasted/picked CSV + a collection name,
/// validates live with per-row ✓/✗, and only enables Import when fully clean.
export function CsvImportModal({
  onImport,
  onClose,
}: {
  onImport: (name: string, tasks: ToolTask[]) => Promise<void>;
  onClose: () => void;
}) {
  const goHelp = useNavStore((s) => s.setTopView);
  const [toolsJson, setToolsJson] = useState(TOOLS_TEMPLATE);
  const [csvText, setCsvText] = useState("");
  const [name, setName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const result = useMemo(() => csvToCollection(csvText, toolsJson), [csvText, toolsJson]);
  const validCount = result.rows.filter((r) => r.ok).length;
  const errorCount = result.rows.length - validCount;
  const canImport = !!result.tasks && !!name.trim() && !busy;

  const pickFile = async () => {
    setFileError(null);
    try {
      const picked = await open({ multiple: false, filters: [{ name: "CSV", extensions: ["csv"] }] });
      if (typeof picked === "string") {
        const text = await readTextCapped(picked);
        setCsvText(text);
        if (!name.trim()) setName(stemOf(picked));
      }
    } catch (e) {
      setFileError(formatIpcError(e));
    }
  };

  const submit = async () => {
    if (!result.tasks || !name.trim()) return;
    setBusy(true);
    try {
      await onImport(name.trim(), result.tasks);
      onClose();
    } catch (e) {
      setFileError(formatIpcError(e));
      setBusy(false);
    }
  };

  const learnMore = () => { goHelp("help"); setTimeout(() => { location.hash = "#help-csv-import"; }, 0); };

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      data-testid="csv-import-modal"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Import tasks from CSV"
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-xl shadow-2xl w-[760px] max-w-[94vw] max-h-[88vh] overflow-y-auto p-6 space-y-5 border border-white/10"
      >
        {/* Title */}
        <div>
          <h2 className="text-base font-bold text-slate-100">Import tasks from CSV</h2>
          <p className="text-xs text-slate-400 mt-1">
            Bulk-load single-turn tool-call tasks from a spreadsheet. Tool schemas are defined once below and
            apply to every row. Parallel / agentic tasks → use <span className="text-slate-300">Import .json</span>.
          </p>
        </div>

        {/* Format guide */}
        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Expected format</div>
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-xs" data-testid="csv-import-example">
              <thead>
                <tr className="bg-white/[0.04] text-slate-400">
                  {EXPECTED_HEADER.map((h) => (
                    <th key={h} className="text-left font-semibold px-3 py-2 font-mono">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-mono text-slate-300">
                {EXAMPLE_ROWS.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="px-3 py-1.5">{r.id}</td>
                    <td className="px-3 py-1.5">{r.prompt}</td>
                    <td className="px-3 py-1.5 text-slate-400">{r.tool}</td>
                    <td className="px-3 py-1.5 text-slate-400">{r.args}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <pre className="text-[11px] bg-black/30 rounded-md p-3 text-slate-400 overflow-x-auto font-mono">{RAW_EXAMPLE}</pre>
          <p className="text-[11px] text-slate-500">
            Empty <span className="font-mono text-slate-400">expected_tool</span> = an abstain task (the model should
            make no tool call). <button type="button" onClick={learnMore} data-testid="csv-import-learnmore" className="text-blue-400 underline underline-offset-2">Learn more ↗</button>
          </p>
        </div>

        {/* Tools schema */}
        <Field label="Tools schema (JSON) — applies to every row">
          <textarea
            value={toolsJson}
            onChange={(e) => setToolsJson(e.target.value)}
            rows={6}
            data-testid="csv-import-tools"
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-xs text-slate-200 font-mono outline-none resize-y"
          />
          {result.toolsError && (
            <div className="text-xs text-red-400" data-testid="csv-import-tools-error">{result.toolsError}</div>
          )}
        </Field>

        {/* CSV input */}
        <Field label="CSV data">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void pickFile()} data-testid="csv-import-file" className="px-3 py-1.5 rounded-md text-xs text-slate-200 bg-white/5 border border-white/10 hover:bg-white/10">
              Choose .csv file…
            </button>
            <span className="text-[11px] text-slate-500">or paste below</span>
          </div>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={6}
            placeholder={RAW_EXAMPLE}
            data-testid="csv-import-paste"
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-xs text-slate-200 font-mono outline-none resize-y"
          />
        </Field>

        {/* Collection name */}
        <Field label="Collection name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-test-cases"
            data-testid="csv-import-name"
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-slate-200 outline-none"
          />
        </Field>

        {/* Live preview / validation */}
        {(csvText.trim() || result.headerError) && (
          <div className="space-y-2" data-testid="csv-import-preview">
            {result.headerError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2" data-testid="csv-import-header-error">
                Header error — {result.headerError}
              </div>
            )}
            {!result.headerError && (
              <>
                <div className="text-[11px] text-slate-400">
                  <span className="text-green-400">{validCount} valid</span>
                  {errorCount > 0 && <span className="text-red-400"> · {errorCount} error{errorCount > 1 ? "s" : ""}</span>}
                </div>
                <div className="max-h-44 overflow-y-auto rounded-md border border-white/5 divide-y divide-white/5">
                  {result.rows.map((r) => (
                    <div key={r.row} className="flex items-start gap-2 px-3 py-1.5 text-xs" data-testid={`csv-row-${r.ok ? "ok" : "err"}-${r.row}`}>
                      <span className={r.ok ? "text-green-400" : "text-red-400"}>{r.ok ? "✓" : "✗"}</span>
                      <span className="text-slate-400 font-mono">Row {r.row}{r.id ? ` (${r.id})` : ""}</span>
                      {!r.ok && <span className="text-red-300">— {r.message}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {fileError && <div className="text-xs text-red-400" data-testid="csv-import-file-error">{fileError}</div>}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} data-testid="csv-import-cancel" className="px-3 py-1.5 rounded-md text-sm text-slate-400 hover:bg-white/5">
            Cancel
          </button>
          <button
            type="button"
            disabled={!canImport}
            onClick={() => void submit()}
            data-testid="csv-import-submit"
            className="px-4 py-1.5 rounded-md text-sm text-white bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {result.tasks ? `${result.tasks.length} task${result.tasks.length > 1 ? "s" : ""}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      {children}
    </div>
  );
}
