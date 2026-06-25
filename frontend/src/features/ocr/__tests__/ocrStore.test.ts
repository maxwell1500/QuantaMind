import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../shared/ipc/ocr/ocr", () => ({
  readFileBase64: vi.fn(async () => "B64DATA"),
  runOcrLive: vi.fn(async () => {}),
  EVENT_OCR_TOKEN: "ocr-token",
  EVENT_OCR_DONE: "ocr-done",
  EVENT_OCR_CANNOT_PROCESS: "ocr-cannot-process",
}));
// Mock the PDF lib so vitest never loads pdfjs (worker ?url import / canvas).
vi.mock("../lib/pdf", () => ({
  openPdf: vi.fn(async () => ({ doc: {}, destroy: vi.fn(async () => {}) })),
  renderPage: vi.fn(async () => "PAGEB64"),
  pdfPageCount: vi.fn(async () => 1),
  base64ToBytes: vi.fn(() => new Uint8Array()),
}));

import { useOcrStore, joinedText, type OcrDoc } from "../state/ocrStore";
import { readFileBase64, runOcrLive } from "../../../shared/ipc/ocr/ocr";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";

beforeEach(() => {
  useOcrStore.setState({ docs: [], selectedId: null, running: false });
  useSelectedModelStore.setState({ selectedModels: [{ name: "qwen3.5:9b", backend: "ollama", size_bytes: 0 }] });
  vi.mocked(runOcrLive).mockClear();
});

const imageDoc = (): OcrDoc => ({ id: "I", name: "a.png", kind: "image", sourceB64: "B64", error: null, pages: [{ page: 1, text: "", status: "pending" }] });

const pdfDoc = (): OcrDoc => ({
  id: "D",
  name: "d.pdf",
  kind: "pdf",
  sourceB64: "",
  error: null,
  pages: [
    { page: 1, text: "", status: "pending" },
    { page: 2, text: "", status: "pending" },
  ],
});

describe("ocrStore", () => {
  it("addDocuments reads an image into a 1-page doc and auto-selects it", async () => {
    await useOcrStore.getState().addDocuments([{ path: "/x/a.png", name: "a.png" }]);
    const d = useOcrStore.getState().docs[0];
    expect(d.kind).toBe("image");
    expect(d.pages).toHaveLength(1);
    expect(d.sourceB64).toBe("B64DATA");
    expect(useOcrStore.getState().selectedId).toBe(d.id);
  });

  it("a file read failure becomes an honest doc error, not a crash", async () => {
    vi.mocked(readFileBase64).mockRejectedValueOnce(new Error("permission denied"));
    await useOcrStore.getState().addDocuments([{ path: "/x/b.png", name: "b.png" }]);
    expect(useOcrStore.getState().docs[0].error).toMatch(/permission denied/);
    expect(useOcrStore.getState().docs[0].pages).toHaveLength(0);
  });

  it("appendToken routes streamed text to the matching page; markCannotProcess flags it", () => {
    useOcrStore.setState({ docs: [pdfDoc()], selectedId: "D" });
    useOcrStore.getState().appendToken("D#1", "Hello ");
    useOcrStore.getState().appendToken("D#1", "world");
    useOcrStore.getState().appendToken("D#2", "page two");
    const d = useOcrStore.getState().docs[0];
    expect(d.pages[0].text).toBe("Hello world");
    expect(d.pages[1].text).toBe("page two");
    useOcrStore.getState().markCannotProcess("D#2");
    expect(useOcrStore.getState().docs[0].pages[1].status).toBe("cannot_process");
  });

  it("joinedText delimits multi-page with --- Page N ---; a single page has no delimiter", () => {
    const single: OcrDoc = { id: "a", name: "a", kind: "image", sourceB64: "", error: null, pages: [{ page: 1, text: "only", status: "done" }] };
    expect(joinedText(single)).toBe("only");
    const multi: OcrDoc = { id: "b", name: "b", kind: "pdf", sourceB64: "", error: null, pages: [{ page: 1, text: "one", status: "done" }, { page: 2, text: "two", status: "done" }] };
    expect(joinedText(multi)).toBe("--- Page 1 ---\none\n\n--- Page 2 ---\ntwo");
  });

  it("runSelected uses the GLOBAL header model (not a local copy)", async () => {
    useSelectedModelStore.setState({ selectedModels: [{ name: "header-model", backend: "ollama", size_bytes: 0 }] });
    useOcrStore.setState({ docs: [imageDoc()], selectedId: "I" });
    await useOcrStore.getState().runSelected();
    expect(runOcrLive).toHaveBeenCalledWith("header-model", "B64", "I#1");
  });

  it("does not run when no global model is selected", async () => {
    useSelectedModelStore.setState({ selectedModels: [] });
    useOcrStore.setState({ docs: [imageDoc()], selectedId: "I" });
    await useOcrStore.getState().runSelected();
    expect(runOcrLive).not.toHaveBeenCalled();
    expect(useOcrStore.getState().docs[0].pages[0].status).toBe("pending");
  });

  it("surfaces an OCR run failure on the page instead of leaving it blank", async () => {
    useOcrStore.setState({ docs: [imageDoc()], selectedId: "I" });
    vi.mocked(runOcrLive).mockRejectedValueOnce(new Error("Ollama unreachable"));
    await useOcrStore.getState().runSelected();
    const p = useOcrStore.getState().docs[0].pages[0];
    expect(p.status).toBe("error");
    expect(p.text).toMatch(/Ollama unreachable/);
  });

  it("a page never retains a rendered image — only text/status (no image field)", () => {
    useOcrStore.setState({ docs: [pdfDoc()], selectedId: "D" });
    const page = useOcrStore.getState().docs[0].pages[0];
    expect(Object.keys(page).sort()).toEqual(["page", "status", "text"]);
  });
});
