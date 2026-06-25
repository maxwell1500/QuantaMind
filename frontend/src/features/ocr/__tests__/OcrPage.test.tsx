import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("../../../shared/ipc/ocr/ocr", () => ({
  writeTextFile: vi.fn(),
  readFileBase64: vi.fn(),
  runOcrLive: vi.fn(),
  EVENT_OCR_TOKEN: "ocr-token",
  EVENT_OCR_DONE: "ocr-done",
  EVENT_OCR_CANNOT_PROCESS: "ocr-cannot-process",
}));

import { OcrPage } from "../components/OcrPage";
import { useOcrStore, type OcrDoc } from "../state/ocrStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";

beforeEach(() => {
  useOcrStore.setState({ docs: [], selectedId: null, model: "qwen3.5:9b", running: false });
  useInstalledModelsStore.setState({ list: [{ name: "qwen3.5:9b", backend: "ollama" } as never], refresh: async () => {} } as never);
});

const doc = (over: Partial<OcrDoc> = {}): OcrDoc => ({
  id: "D",
  name: "scan.pdf",
  kind: "pdf",
  sourceB64: "",
  error: null,
  pages: [
    { page: 1, text: "Invoice total $42", status: "done" },
    { page: 2, text: "", status: "cannot_process" },
  ],
  ...over,
});

describe("OcrPage", () => {
  it("shows the empty hint until a document is selected", () => {
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-page")).toBeInTheDocument();
    expect(screen.getByTestId("ocr-output")).toHaveTextContent("Select a document");
  });

  it("renders the sticky verify-against-source note with the model + per-page text", () => {
    useOcrStore.setState({ docs: [doc()], selectedId: "D" });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-verify-note")).toHaveTextContent("verify important text against the source");
    expect(screen.getByTestId("ocr-verify-note")).toHaveTextContent("qwen3.5:9b");
    expect(screen.getByTestId("ocr-page-1")).toHaveTextContent("Invoice total $42");
  });

  it("shows a Cannot process notice for a gated page (no fabricated text)", () => {
    useOcrStore.setState({ docs: [doc()], selectedId: "D" });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-cannot-2")).toHaveTextContent("Cannot process");
  });

  it("surfaces an honest per-document error for an unreadable file", () => {
    useOcrStore.setState({ docs: [doc({ error: "couldn't read", pages: [] })], selectedId: "D" });
    render(<OcrPage />);
    expect(screen.getByTestId("ocr-doc-error")).toHaveTextContent("couldn't read");
  });
});
