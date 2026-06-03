import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HistoryTimeline } from "../../components/matrix/HistoryTimeline";

const hist = [
  { ts: "t1", model: "m1", backend: "ollama", parse_rate: 1, tool_selection_acc: 1, arg_acc: 1, abstain_acc: null, composite: 0.8, n: 3 },
  { ts: "t2", model: "m1", backend: "ollama", parse_rate: 1, tool_selection_acc: 1, arg_acc: 1, abstain_acc: null, composite: 0.6, n: 3 },
] as never;

describe("HistoryTimeline", () => {
  it("shows an empty state with no history", () => {
    render(<HistoryTimeline history={[]} />);
    expect(screen.getByTestId("eval-history-empty")).toBeTruthy();
  });

  it("renders one polyline series per model", () => {
    const { container } = render(<HistoryTimeline history={hist} />);
    expect(screen.getByTestId("eval-history-timeline")).toBeTruthy();
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
  });
});
