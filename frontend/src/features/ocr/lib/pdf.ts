import * as pdfjs from "pdfjs-dist";
// Bundle the worker LOCALLY (Vite ?url) — NEVER a CDN. The app is local-first/offline.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface OpenedPdf {
  doc: PDFDocumentProxy;
  /// Releases the worker + resources (v6: the loading task owns `destroy`, not the doc).
  destroy: () => Promise<void>;
}

/// Open a PDF from raw bytes. Caller MUST call `.destroy()` when done. Throws on an
/// encrypted/corrupt PDF — callers surface that as an honest per-document error.
export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  return { doc, destroy: () => task.destroy() };
}

/// Page count without rasterizing any page (cheap — used at upload time).
export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  const { doc, destroy } = await openPdf(bytes);
  const n = doc.numPages;
  await destroy();
  return n;
}

/// Rasterize ONE page (1-based) to a base64 PNG — the OCR input, rendered on demand and discarded by
/// the caller after the page is OCR'd (never retained for display). `scale` 2 for legible text.
export async function renderPage(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("could not create a canvas context for PDF rendering");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL("image/png").split(",")[1] ?? ""; // strip the data-URI prefix → base64
}

/// Decode a base64 string (from the Rust `read_file_base64`) to bytes for PDF.js. In-memory only —
/// not file I/O (the bytes were read by Rust).
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
