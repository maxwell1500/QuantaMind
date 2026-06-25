import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisionOCRPanel } from "../components/vision/VisionOCRPanel";
import { useVisionStore } from "../state/visionStore";
import type { VisionReport } from "../../../shared/ipc/eval/vision";

const TINY_PNG = "iVBORw0KGgo="; // not a real image — only the data-URI wiring is asserted

const report: VisionReport = {
  collection_id: "easy-ocr",
  model: "qwen3.5:9b",
  rows: [
    { task_id: "receipt", model: "qwen3.5:9b", status: "scored", extracted: "Invoice total $42", ground_truth: "Invoice total $42.00", image_b64: TINY_PNG,
      metrics: { cer: 0.1, wer: 0.2, substitutions: 1, insertions: 0, deletions: 0, ref_words: 3, critical_token_accuracy: 0.5 } },
    { task_id: "note", model: "qwen3.5:9b", status: "hallucinated", extracted: "call dentist plus buy milk and eggs", ground_truth: "call dentist", image_b64: TINY_PNG,
      metrics: { cer: 2.0, wer: 2.0, substitutions: 0, insertions: 4, deletions: 0, ref_words: 2, critical_token_accuracy: null } },
  ],
};

beforeEach(() => useVisionStore.setState({ report: null, running: false, error: null }));

describe("VisionOCRPanel", () => {
  it("disables Run until a model is selected", () => {
    render(<VisionOCRPanel model="" />);
    expect(screen.getByTestId("vision-run")).toBeDisabled();
  });

  it("renders a scored row with the image, diff, and CER/WER", () => {
    useVisionStore.setState({ report });
    render(<VisionOCRPanel model="qwen3.5:9b" />);
    expect(screen.getByTestId("vision-image-receipt")).toHaveAttribute("src", `data:image/png;base64,${TINY_PNG}`);
    expect(screen.getByTestId("vision-metrics-receipt")).toHaveTextContent("CER 10%");
    expect(screen.getByTestId("vision-summary")).toBeInTheDocument();
  });

  it("flags a hallucinated row distinctly", () => {
    useVisionStore.setState({ report });
    render(<VisionOCRPanel model="qwen3.5:9b" />);
    expect(screen.getByTestId("vision-hallucinated-note")).toHaveTextContent("Hallucinated");
  });

  it("shows Cannot process for a gated model and no metrics", () => {
    useVisionStore.setState({
      report: { collection_id: "easy-ocr", model: "llama3", rows: [
        { task_id: "receipt", model: "llama3", status: "cannot_process", metrics: null, extracted: "", ground_truth: "Invoice", image_b64: TINY_PNG },
      ] },
    });
    render(<VisionOCRPanel model="llama3" />);
    expect(screen.getByTestId("vision-cannot-receipt")).toHaveTextContent("Cannot process");
    expect(screen.queryByTestId("vision-metrics-receipt")).toBeNull();
  });
});
