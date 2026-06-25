import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../../../shared/ipc/ocr/ocr", () => ({
  writeTextFile: vi.fn(),
  readFileBase64: vi.fn(),
  runOcrLive: vi.fn(),
  ocrModelSupportsVision: vi.fn(async () => true),
  stopOcr: vi.fn(),
  EVENT_OCR_TOKEN: "ocr-token",
  EVENT_OCR_DONE: "ocr-done",
  EVENT_OCR_CANNOT_PROCESS: "ocr-cannot-process",
}));

import { OcrPage } from "../components/OcrPage";
import { useOcrStore, type OcrDoc } from "../state/ocrStore";
import { useSelectedModelStore } from "../../../shared/state/selectedModelStore";

beforeEach(() => {
  useOcrStore.setState({ docs: [], selectedId: null, running: false });
  // OCR uses the GLOBAL header model (no per-page picker, no local copy).
  useSelectedModelStore.setState({ selectedModels: [{ name: "qwen3.5:9b", backend: "ollama", size_bytes: 0 }] });
});

const doc = (over: Partial<OcrDoc> = {}): OcrDoc => ({
  id: "D",
  name: "scan.pdf",
  kind: "pdf",
  sourceB64: "",
  error: null,
  pages: [
    { page: 1, text: "Invoice total $42", status: "done" },
    { page: 2, text: "Second page text", status: "done" },
  ],
  ...over,
});

describe("OcrPage", () => {
  it("shows the empty hint until a document is selected", () => {
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-page")).toBeInTheDocument();
    expect(screen.getByTestId("ocr-output")).toHaveTextContent("Select a document");
  });

  it("renders the sticky verify note + ALL pages as one continuous block (no Page N breaks)", () => {
    useOcrStore.setState({ docs: [doc()], selectedId: "D" });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-verify-note")).toHaveTextContent("verify important text against the source");
    const text = screen.getByTestId("ocr-text");
    expect(text).toHaveTextContent("Invoice total $42");
    expect(text).toHaveTextContent("Second page text"); // page 2 flows into the same block
    expect(text.textContent).not.toMatch(/Page 1|Page 2/); // no per-page headers
    expect(screen.queryByTestId("ocr-page-1")).toBeNull();
  });

  it("uses the global header model and has no per-page model picker", () => {
    useOcrStore.setState({ docs: [doc()], selectedId: "D" });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-model")).toHaveTextContent("qwen3.5:9b");
    expect(screen.queryByTestId("ocr-model-select")).toBeNull();
    // …and the verify note reflects that same global model.
    expect(screen.getByTestId("ocr-verify-note")).toHaveTextContent("qwen3.5:9b");
  });

  it("shows one Cannot process notice when the model is text-only (no fabricated text)", () => {
    useOcrStore.setState({ docs: [doc({ pages: [{ page: 1, text: "", status: "cannot_process" }, { page: 2, text: "", status: "cannot_process" }] })], selectedId: "D" });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-cannot")).toHaveTextContent("Cannot process");
    expect(screen.queryByTestId("ocr-text")).toBeNull();
  });

  it("surfaces a per-page run error inline without breaking the flow", () => {
    useOcrStore.setState({ docs: [doc({ pages: [{ page: 1, text: "good text", status: "done" }, { page: 2, text: "OCR failed — boom", status: "error" }] })], selectedId: "D" });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-error")).toHaveTextContent("OCR failed — boom");
    expect(screen.getByTestId("ocr-text")).toHaveTextContent("good text");
  });

  it("shows Stop + a live progress indicator while running (never feels stuck)", () => {
    useOcrStore.setState({ docs: [doc()], selectedId: "D", running: true, activePage: 1 });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-stop")).toBeInTheDocument();
    expect(screen.queryByTestId("ocr-run")).toBeNull();
    expect(screen.getByTestId("ocr-progress")).toHaveTextContent("Extracting page 1");
  });

  it("surfaces an honest per-document error for an unreadable file", () => {
    useOcrStore.setState({ docs: [doc({ error: "couldn't read", pages: [] })], selectedId: "D" });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-doc-error")).toHaveTextContent("couldn't read");
  });
});
