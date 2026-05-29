import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompareDiff } from "../components/CompareDiff";
import { useCompareStore } from "../state/compareStore";
import { newRow } from "../state/compareRow";

const doneRow = (model: string, output: string) => ({
  ...newRow(model), status: "done" as const, output,
});

beforeEach(() => useCompareStore.getState().reset());

describe("CompareDiff", () => {
  it("renders nothing unless exactly two rows are done", () => {
    useCompareStore.setState({ rows: [doneRow("a", "x")] });
    const { container } = render(<CompareDiff />);
    expect(container.firstChild).toBeNull();
  });

  it("toggles a word-level diff between the two outputs", () => {
    useCompareStore.setState({ rows: [doneRow("a", "the cat"), doneRow("b", "the dog")] });
    render(<CompareDiff />);
    expect(screen.queryByTestId("diff-view")).toBeNull();
    fireEvent.click(screen.getByTestId("diff-toggle"));
    const diff = screen.getByTestId("diff-view");
    expect(diff).toHaveTextContent("cat");
    expect(diff).toHaveTextContent("dog");
  });
});
