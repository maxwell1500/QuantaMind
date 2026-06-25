import { create } from "zustand";
import { readFileBase64, runOcrLive, ocrModelSupportsVision, stopOcr } from "../../../shared/ipc/ocr/ocr";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";

/// The OCR model is ALWAYS the global header selection (architecture rule 7) — read fresh at run
/// time so it can never be stale relative to the header.
const currentModel = () => useSelectedModelStore.getState().selectedModels[0]?.name ?? "";

/// Tauri rejects with a serialized error (often an object), not an `Error` — extract a readable
/// message so the UI never shows "[object Object]".
const errMsg = (e: unknown): string =>
  typeof e === "string" ? e
    : e instanceof Error ? e.message
      : e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
        ? (e as { message: string }).message
        : JSON.stringify(e);

export type PageStatus = "pending" | "running" | "done" | "error" | "cannot_process";

export interface OcrPage {
  /// 1-based page number.
  page: number;
  text: string;
  status: PageStatus;
}

export interface OcrDoc {
  id: string;
  name: string;
  kind: "image" | "pdf";
  /// The SOURCE file (image bytes, or the whole PDF) as base64 — kept to render pages on demand.
  /// Rendered PDF page-images are transient (never stored): rasterized at run time, discarded after.
  sourceB64: string;
  pages: OcrPage[];
  /// A per-document render/load error (e.g. an encrypted/corrupt PDF) — honest, not a crash.
  error: string | null;
}

interface OcrStore {
  docs: OcrDoc[];
  selectedId: string | null;
  running: boolean;
  /// The page currently being extracted (1-based), for the live progress indicator. null when idle.
  activePage: number | null;
  cancelRequested: boolean;
  addDocuments: (files: { path: string; name: string }[]) => Promise<void>;
  select: (id: string) => void;
  appendToken: (requestId: string, text: string) => void;
  markCannotProcess: (requestId: string) => void;
  runSelected: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

const reqId = (docId: string, page: number) => `${docId}#${page}`;
const parseReq = (rid: string): { docId: string; page: number } => {
  const i = rid.lastIndexOf("#");
  return { docId: rid.slice(0, i), page: Number(rid.slice(i + 1)) };
};

/// Join a document's per-page text for Copy/Export — multi-page gets `--- Page N ---` delimiters so
/// the output isn't a wall of run-together pages.
export function joinedText(doc: OcrDoc): string {
  if (doc.pages.length <= 1) return doc.pages[0]?.text ?? "";
  return doc.pages.map((p) => `--- Page ${p.page} ---\n${p.text}`).join("\n\n");
}

export const useOcrStore = create<OcrStore>((set, get) => ({
  docs: [],
  selectedId: null,
  running: false,
  activePage: null,
  cancelRequested: false,

  addDocuments: async (files) => {
    for (const f of files) {
      const id = `${f.name}:${f.path}`;
      if (get().docs.some((d) => d.id === id)) continue;
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      const isPdf = ext === "pdf";
      let doc: OcrDoc;
      try {
        const sourceB64 = await readFileBase64(f.path);
        if (isPdf) {
          const { pdfPageCount, base64ToBytes } = await import("../lib/pdf");
          const count = await pdfPageCount(base64ToBytes(sourceB64));
          doc = { id, name: f.name, kind: "pdf", sourceB64, error: null, pages: Array.from({ length: count }, (_, i) => ({ page: i + 1, text: "", status: "pending" })) };
        } else {
          doc = { id, name: f.name, kind: "image", sourceB64, error: null, pages: [{ page: 1, text: "", status: "pending" }] };
        }
      } catch (e) {
        doc = { id, name: f.name, kind: isPdf ? "pdf" : "image", sourceB64: "", error: e instanceof Error ? e.message : String(e), pages: [] };
      }
      set((s) => ({ docs: [...s.docs, doc], selectedId: s.selectedId ?? id }));
    }
  },

  select: (id) => set({ selectedId: id }),

  appendToken: (requestId, text) => {
    const { docId, page } = parseReq(requestId);
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === docId ? { ...d, pages: d.pages.map((p) => (p.page === page ? { ...p, text: p.text + text } : p)) } : d,
      ),
    }));
  },

  markCannotProcess: (requestId) => {
    const { docId, page } = parseReq(requestId);
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === docId ? { ...d, pages: d.pages.map((p) => (p.page === page ? { ...p, status: "cannot_process" } : p)) } : d,
      ),
    }));
  },

  runSelected: async () => {
    const model = currentModel();
    const { selectedId, docs } = get();
    const doc = docs.find((d) => d.id === selectedId);
    if (!doc || !model || doc.error || get().running) return;

    const setPage = (page: number, patch: Partial<OcrPage>) =>
      set((s) => ({ docs: s.docs.map((d) => (d.id === doc.id ? { ...d, pages: d.pages.map((p) => (p.page === page ? { ...p, ...patch } : p)) } : d)) }));
    const setAllPages = (patch: Partial<OcrPage>) =>
      set((s) => ({ docs: s.docs.map((d) => (d.id === doc.id ? { ...d, pages: d.pages.map((p) => ({ ...p, ...patch })) } : d)) }));

    set({ running: true, cancelRequested: false, activePage: null });
    setAllPages({ text: "", status: "pending" }); // clear prior text on re-run

    // Gate ONCE up front (not per page — a per-page probe false-negatives while Ollama is busy).
    try {
      if (!(await ocrModelSupportsVision(model))) {
        setAllPages({ status: "cannot_process" });
        return;
      }
    } catch (e) {
      setAllPages({ status: "error", text: `Couldn't check the model — ${errMsg(e)}` });
      return;
    }

    let opened: Awaited<ReturnType<typeof import("../lib/pdf").openPdf>> | null = null;
    try {
      const pdf = await import("../lib/pdf");
      if (doc.kind === "pdf") {
        opened = await pdf.openPdf(pdf.base64ToBytes(doc.sourceB64));
      }
      for (const p of doc.pages) {
        if (get().cancelRequested) break;
        set({ activePage: p.page });
        setPage(p.page, { status: "running" });
        let inputB64: string;
        try {
          inputB64 = doc.kind === "image" ? doc.sourceB64 : await pdf.renderPage(opened!.doc, p.page); // transient — discarded after this iteration
        } catch (e) {
          setPage(p.page, { status: "error", text: `Could not render page — ${errMsg(e)}` });
          continue;
        }
        try {
          await runOcrLive(model, inputB64, reqId(doc.id, p.page));
        } catch (e) {
          // A failed run (e.g. Ollama unreachable) must surface, not leave the page silently blank.
          setPage(p.page, { status: "error", text: `OCR failed — ${errMsg(e)}` });
          continue;
        }
        setPage(p.page, { status: "done" });
        if (get().cancelRequested) break;
      }
    } finally {
      await opened?.destroy();
      set({ running: false, activePage: null, cancelRequested: false });
    }
  },

  stop: () => {
    if (!get().running) return;
    set({ cancelRequested: true });
    void stopOcr(); // cancels the in-flight backend run so the current page resolves promptly
  },

  reset: () => set({ docs: [], selectedId: null, running: false, activePage: null, cancelRequested: false }),
}));
