import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextCliffChart } from "../components/ContextCliffChart";
import type { CliffPoint } from "../cliff";

const points: CliffPoint[] = [
  { promptTokens: 1000, composite: 0.9 },
  { promptTokens: 8000, composite: 0.4 },
];

describe("ContextCliffChart hover", () => {
  it("shows a tooltip with token depth + accuracy when a point is hovered", () => {
    render(<ContextCliffChart points={points} width={580} height={220} />);
    expect(screen.queryByTestId("cliff-tooltip")).toBeNull();
    fireEvent.mouseEnter(screen.getByTestId("cliff-point-0"));
    const tip = screen.getByTestId("cliff-tooltip");
    expect(tip).toHaveTextContent("1,000 ctx tokens");
    expect(tip).toHaveTextContent("90% accuracy");
    fireEvent.mouseLeave(screen.getByTestId("cliff-point-0"));
    expect(screen.queryByTestId("cliff-tooltip")).toBeNull();
  });
});
