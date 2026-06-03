import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextBudgetBar } from "../ContextBudgetBar";

describe("ContextBudgetBar", () => {
  it("shows the prompt-tokens / context-length ratio", () => {
    render(<ContextBudgetBar promptTokens={2048} contextLength={8192} />);
    expect(screen.getByTestId("context-budget")).toHaveTextContent("2048 / 8192 (25%)");
  });

  it("turns the fill red at ≥95%", () => {
    render(<ContextBudgetBar promptTokens={7900} contextLength={8192} />);
    expect(screen.getByTestId("context-budget-fill").className).toContain("bg-red-600");
  });

  it("shows 'Not available' when a value is missing", () => {
    render(<ContextBudgetBar promptTokens={null} contextLength={8192} />);
    expect(screen.getByTestId("context-budget")).toHaveTextContent("Not available");
  });
});
