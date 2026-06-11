import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LlmStageMetrics } from "../components/LlmStageMetrics";
import { PipelineSummary } from "../components/PipelineSummary";
import { useAssistantResultStore, type AssistantResult } from "../state/assistantResultStore";
import { useSttResultStore } from "../state/sttResultStore";
import type { Transcript } from "../../../shared/ipc/stt/transcribe";

const llm = (over: Partial<AssistantResult> = {}): AssistantResult => ({
  transcriptId: "clip-1",
  model: "llama3.2:1b",
  system: null,
  output: "the customer's bike is broken",
  ttftMs: 120,
  tokensPerSec: 50,
  tokenCount: 42,
  totalMs: 2400,
  wallMs: 2500,
  auto: false,
  ...over,
});

const transcript = (over: Partial<Transcript> = {}): Transcript =>
  ({
    id: "clip-1",
    model: "ggml-base.en.bin",
    language: "en",
    audio: { sample_rate_hz: 16000, channels: 1, duration_secs: 3.2 },
    segments: [],
    complete: true,
    stats: { transcribe_wall_ms: 1100, rtf: 2.9 },
    stt_profile: null,
    ...over,
  }) as unknown as Transcript;

beforeEach(() => {
  useAssistantResultStore.getState().clear();
  useSttResultStore.getState().clear();
});

describe("LlmStageMetrics", () => {
  it("renders nothing until a summary exists", () => {
    const { container } = render(<LlmStageMetrics />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the measured LLM metrics and the summary output", () => {
    useAssistantResultStore.getState().setResult(llm());
    render(<LlmStageMetrics showOutput />);
    expect(screen.getByTestId("stt-llm-ttft").textContent).toContain("120 ms");
    expect(screen.getByTestId("stt-llm-throughput").textContent).toContain("50.0 tok/s");
    expect(screen.getByTestId("stt-llm-tokens").textContent).toContain("42");
    expect(screen.getByTestId("stt-llm-output").textContent).toContain("bike is broken");
  });

  it("renders N/A for a missing metric, never a fabricated 0", () => {
    useAssistantResultStore.getState().setResult(llm({ ttftMs: null, tokensPerSec: null }));
    render(<LlmStageMetrics />);
    expect(screen.getByTestId("stt-llm-ttft").textContent).toContain("N/A");
    expect(screen.getByTestId("stt-llm-throughput").textContent).toContain("N/A");
  });
});

describe("PipelineSummary", () => {
  it("hides until both stages ran for the same transcript", () => {
    useSttResultStore.getState().setResult(transcript());
    const { container } = render(<PipelineSummary />);
    expect(container).toBeEmptyDOMElement(); // no LLM stage yet
  });

  it("shows Audio -> Transcript -> LLM with the end-to-end total", () => {
    useSttResultStore.getState().setResult(transcript());
    useAssistantResultStore.getState().setResult(llm());
    render(<PipelineSummary />);
    const el = screen.getByTestId("stt-pipeline-summary");
    expect(el.textContent).toContain("Audio 3.20s");
    expect(el.textContent).toContain("Transcript 1.10s");
    expect(el.textContent).toContain("LLM summarize 2.50s");
    // end-to-end = STT wall (1100) + LLM wall (2500) = 3600ms.
    expect(screen.getByTestId("stt-pipeline-total").textContent).toBe("3.60s");
  });

  it("does not show when the LLM ran for a different transcript", () => {
    useSttResultStore.getState().setResult(transcript({ id: "clip-1" }));
    useAssistantResultStore.getState().setResult(llm({ transcriptId: "clip-OTHER" }));
    const { container } = render(<PipelineSummary />);
    expect(container).toBeEmptyDOMElement();
  });
});
