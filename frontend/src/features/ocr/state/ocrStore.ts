import { create } from "zustand";
import { readFileBase64, runOcrLive } from "../../../shared/ipc/ocr/ocr";

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
  model: string;
  running: boolean;
  addDocuments: (files: { path: string; name: string }[]) => Promise<void>;
  select: (id: string) => void;
  setModel: (m: string) => void;
  appendToken: (requestId: string, text: string) => void;
  markCannotProcess: (requestId: string) => void;
  runSelected: () => Promise<void>;
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
  model: "",
  running: false,

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
  setModel: (m) => set({ model: m }),

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
    const { selectedId, docs, model } = get();
    const doc = docs.find((d) => d.id === selectedId);
    if (!doc || !model || doc.error || get().running) return;

    const setPage = (page: number, patch: Partial<OcrPage>) =>
      set((s) => ({ docs: s.docs.map((d) => (d.id === doc.id ? { ...d, pages: d.pages.map((p) => (p.page === page ? { ...p, ...patch } : p)) } : d)) }));

    set({ running: true });
    // Clear prior text on re-run.
    set((s) => ({ docs: s.docs.map((d) => (d.id === doc.id ? { ...d, pages: d.pages.map((p) => ({ ...p, text: "", status: "pending" as PageStatus })) } : d)) }));

    let opened: Awaited<ReturnType<typeof import("../lib/pdf").openPdf>> | null = null;
    try {
      const pdf = await import("../lib/pdf");
      if (doc.kind === "pdf") {
        opened = await pdf.openPdf(pdf.base64ToBytes(doc.sourceB64));
      }
      for (const p of doc.pages) {
        setPage(p.page, { status: "running" });
        let inputB64: string;
        try {
          inputB64 = doc.kind === "image" ? doc.sourceB64 : await pdf.renderPage(opened!.doc, p.page); // transient — discarded after this iteration
        } catch (e) {
          setPage(p.page, { status: "error", text: e instanceof Error ? e.message : String(e) });
          continue;
        }
        await runOcrLive(model, inputB64, reqId(doc.id, p.page));
        // The backend emits ocr-done (invoke resolved) or ocr-cannot-process (status already set).
        const cur = get().docs.find((d) => d.id === doc.id)?.pages.find((x) => x.page === p.page)?.status;
        setPage(p.page, cur === "cannot_process" ? {} : { status: "done" });
      }
    } finally {
      await opened?.destroy();
      set({ running: false });
    }
  },

  reset: () => set({ docs: [], selectedId: null, running: false }),
}));
