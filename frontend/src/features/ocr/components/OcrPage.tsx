import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useOcrStore, joinedText } from "../state/ocrStore";
import { useOcrStream } from "../hooks/useOcrStream";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";
import { writeTextFile } from "../../../shared/ipc/ocr/ocr";

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/// The OCR tool: upload images/PDFs (left), Run OCR, and watch the extracted text stream into the
/// main area per page. The model is ALWAYS the global header selection (architecture rule 7 — no
/// per-page model picker). No image/PDF preview — the source isn't shown, so a sticky "verify
/// against source" note keeps the output honest. Copy / Export the text.
export function OcrPage() {
  useOcrStream();
  const { docs, selectedId, running, activePage, addDocuments, select, runSelected, stop } = useOcrStore();
  // The model is ALWAYS the global header selection (the first selected model). Read directly from
  // the global store — no per-page picker, no local copy that could drift. A text-only model → the
  // run reports "Cannot process".
  const model = useSelectedModelStore((s) => s.selectedModels[0]?.name ?? "");

  // Elapsed-seconds ticker for the current page — a long first-token wait (model load + image
  // prefill can take a couple of minutes) shouldn't look frozen. Resets each page.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running, activePage]);

  const doc = docs.find((d) => d.id === selectedId) ?? null;
  // One continuous document — all pages' text joined (no per-page boxes).
  const fullText = doc ? doc.pages.map((p) => p.text).filter(Boolean).join("\n\n") : "";
  const allCannotProcess = !!doc && doc.pages.length > 0 && doc.pages.every((p) => p.status === "cannot_process");
  const pageErrors = doc ? doc.pages.filter((p) => p.status === "error") : [];

  const onUpload = async () => {
    const picked = await open({
      multiple: true,
      filters: [{ name: "Images & PDF", extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf"] }],
    });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    if (paths.length) await addDocuments(paths.map((p) => ({ path: p, name: basename(p) })));
  };

  const onCopy = () => {
    if (doc) void navigator.clipboard.writeText(joinedText(doc));
  };
  const onExport = async () => {
    if (!doc) return;
    const path = await save({ defaultPath: `${doc.name}.txt`, filters: [{ name: "Text", extensions: ["txt"] }] });
    if (path) await writeTextFile(path, joinedText(doc));
  };

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "300px 1fr" }} data-testid="ocr-page">
      {/* LEFT sidebar: controls + document list */}
      <aside className="flex flex-col gap-3 border border-slate-200 rounded-xl p-3 bg-white">
        <div className="text-base font-bold text-slate-900">OCR</div>
        <button type="button" onClick={onUpload} data-testid="ocr-upload" className="bg-slate-950 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold py-2 px-3">
          ⬆ Upload images / PDF
        </button>
        <div className="text-xs text-slate-500">
          Model (from header):{" "}
          <span className="font-semibold text-slate-700" data-testid="ocr-model">
            {model || "— select a model in the header"}
          </span>
        </div>
        <div className="flex gap-2">
          {running ? (
            <button type="button" onClick={stop} data-testid="ocr-stop" className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold py-2">
              ■ Stop
            </button>
          ) : (
            <button type="button" onClick={() => void runSelected()} disabled={!doc || !model || !!doc?.error} data-testid="ocr-run" className="flex-1 bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-sm font-semibold py-2">
              Run OCR
            </button>
          )}
        </div>
        {running && (
          <div className="flex items-center gap-2 text-xs text-blue-700" data-testid="ocr-progress">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
            Extracting{activePage ? ` page ${activePage}` : ""}… {elapsed}s
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCopy} disabled={!doc} data-testid="ocr-copy" className="flex-1 border border-slate-200 rounded-lg text-sm py-1.5 disabled:text-slate-300">Copy</button>
          <button type="button" onClick={() => void onExport()} disabled={!doc} data-testid="ocr-export" className="flex-1 border border-slate-200 rounded-lg text-sm py-1.5 disabled:text-slate-300">Export .txt</button>
        </div>
        <div className="text-xs text-slate-500 mt-1">Documents</div>
        <ul className="flex flex-col gap-1 overflow-auto">
          {docs.length === 0 && <li className="text-xs text-slate-400">None yet — upload to start.</li>}
          {docs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => select(d.id)}
                data-testid={`ocr-doc-${d.id}`}
                className={`w-full text-left text-xs rounded px-2 py-1 truncate ${d.id === selectedId ? "bg-blue-50 text-blue-700" : "hover:bg-slate-50 text-slate-700"}`}
                title={d.name}
              >
                {d.kind === "pdf" ? "📄" : "🖼"} {d.name}{d.kind === "pdf" && d.pages.length > 1 ? ` (${d.pages.length}p)` : ""}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* MAIN: live extracted text (no preview) */}
      <main className="border border-slate-200 rounded-xl bg-white min-w-0 flex flex-col" data-testid="ocr-output">
        {!doc ? (
          <div className="p-6 text-sm text-slate-400">Select a document and press Run OCR.</div>
        ) : doc.error ? (
          <div className="p-6 text-sm text-red-700" data-testid="ocr-doc-error">Couldn't read this file — {doc.error}</div>
        ) : (
          <>
            {/* Sticky honesty note — the source isn't shown, so verification is on the user. */}
            <div className="sticky top-0 z-10 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800" data-testid="ocr-verify-note">
              Extracted by <b>{model || "—"}</b> — OCR accuracy varies by model; verify important text against the source.
            </div>
            <div className="flex-1 overflow-auto p-4">
              {allCannotProcess ? (
                <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded px-3 py-2" data-testid="ocr-cannot">
                  Cannot process — “{model}” is a text-only model. Pick a vision model in the header.
                </div>
              ) : (
                <>
                  {pageErrors.length > 0 && (
                    <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1" data-testid="ocr-error">
                      {pageErrors.map((p) => p.text).join(" · ")}
                    </div>
                  )}
                  {/* All pages flow as one continuous document — no per-page breaks. */}
                  {fullText && <pre className="whitespace-pre-wrap break-words text-sm text-slate-900 font-mono" data-testid="ocr-text">{fullText}</pre>}
                  {running ? (
                    <div className="mt-2 flex items-center gap-2 text-xs text-blue-700" data-testid="ocr-reading">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" aria-hidden />
                      Extracting{activePage ? ` page ${activePage}` : ""}… {elapsed}s{!fullText ? " — the first page can take a couple of minutes while the model loads" : ""}
                    </div>
                  ) : (
                    !fullText && <div className="text-sm text-slate-400" data-testid="ocr-empty">No text extracted.</div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
