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
  const { docs, selectedId, running, addDocuments, select, runSelected } = useOcrStore();
  // The model is ALWAYS the global header selection (the first selected model). Read directly from
  // the global store — no per-page picker, no local copy that could drift. A text-only model → the
  // run reports "Cannot process".
  const model = useSelectedModelStore((s) => s.selectedModels[0]?.name ?? "");

  const doc = docs.find((d) => d.id === selectedId) ?? null;

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
          <button type="button" onClick={() => void runSelected()} disabled={!doc || !model || running || !!doc?.error} data-testid="ocr-run" className="flex-1 bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-sm font-semibold py-2">
            {running ? "Running…" : "Run OCR"}
          </button>
        </div>
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
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-4">
              {doc.pages.map((p) => (
                <section key={p.page} data-testid={`ocr-page-${p.page}`}>
                  {doc.pages.length > 1 && <div className="text-xs font-semibold text-slate-400 mb-1">Page {p.page}</div>}
                  {p.status === "cannot_process" ? (
                    <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1" data-testid={`ocr-cannot-${p.page}`}>
                      Cannot process — “{model}” is a text-only model. Pick a vision model in the header.
                    </div>
                  ) : p.status === "error" ? (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1" data-testid={`ocr-page-error-${p.page}`}>{p.text}</div>
                  ) : p.status === "running" && !p.text ? (
                    <div className="text-xs text-slate-400" data-testid={`ocr-running-${p.page}`}>Extracting…</div>
                  ) : p.status === "done" && !p.text ? (
                    <div className="text-xs text-slate-400" data-testid={`ocr-empty-${p.page}`}>(no text found on this page)</div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words text-sm text-slate-900 font-mono">{p.text}{p.status === "running" ? " …" : ""}</pre>
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
