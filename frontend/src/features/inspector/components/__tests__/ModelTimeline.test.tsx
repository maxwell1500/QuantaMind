import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelTimeline } from "../ModelTimeline";
import type { CompareRow } from "../../../compare/state/compareRow";

const row: CompareRow = {
  model: "phi3:mini", modelId: null, status: "done", output: "x",
  metrics: {
    ttft_ms: 10, tokens_per_sec: 40, token_count: 2,
    timeline: [{ text: "Hi", t_ms: 10, n: 1 }, { text: " there", t_ms: 30, n: 2 }],
  },
  error: null, startedAt: null, endedAt: null,
};

describe("ModelTimeline", () => {
  it("shows the model name and summary", () => {
    render(<ModelTimeline row={row} width={400} />);
    expect(screen.getByText("phi3:mini")).toBeInTheDocument();
    expect(screen.getByText(/2 tokens · TTFT 10ms/)).toBeInTheDocument();
  });

  it("updates the readout when a bar is hovered, and clears on leave", () => {
    const { container } = render(<ModelTimeline row={row} width={400} />);
    const readout = screen.getByTestId("readout-phi3:mini");
    expect(readout).toHaveTextContent("Hover a bar");
    fireEvent.mouseEnter(container.querySelector('[data-testid="hit-2"]')!);
    expect(readout).toHaveTextContent('#2 · 20ms — " there"');
    fireEvent.mouseLeave(container.querySelector('[data-testid="token-timeline"]')!);
    expect(readout).toHaveTextContent("Hover a bar");
  });
});
