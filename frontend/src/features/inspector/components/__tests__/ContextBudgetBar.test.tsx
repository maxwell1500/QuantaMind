import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContextBudgetBar } from "../ContextBudgetBar";
import { useCliffStore } from "../../../eval/state/cliffStore";

beforeEach(() => {
  useCliffStore.setState({ results: {} });
});

describe("ContextBudgetBar", () => {
  it("reads the cliff edge from the cliff store (backend source of truth, not localStorage)", () => {
    useCliffStore.setState({ results: { finance: { "test-model": 4000 } } });
    render(<ContextBudgetBar modelName="test-model" promptTokens={2048} contextLength={8192} />);
    expect(screen.getByTestId("context-budget")).toHaveTextContent("indicative cliff ≈4000");
  });

  it("shows no cliff caption when the store has no measurement for the model", () => {
    render(<ContextBudgetBar modelName="unprobed" promptTokens={2048} contextLength={8192} />);
    expect(screen.getByTestId("context-budget")).not.toHaveTextContent("indicative cliff");
  });

  it("shows the prompt-tokens / context-length ratio", () => {
    render(<ContextBudgetBar modelName="test-model" promptTokens={2048} contextLength={8192} />);
    expect(screen.getByTestId("context-budget")).toHaveTextContent("2048 / 8192 (25%)");
  });

  it("turns the fill red at ≥95%", () => {
    render(<ContextBudgetBar modelName="test-model" promptTokens={7900} contextLength={8192} />);
    expect(screen.getByTestId("context-budget-fill").className).toContain("bg-red-600");
  });

  it("shows 'Not available' when a value is missing", () => {
    render(<ContextBudgetBar modelName="test-model" promptTokens={null} contextLength={8192} />);
    expect(screen.getByTestId("context-budget")).toHaveTextContent("Not available");
  });
});
