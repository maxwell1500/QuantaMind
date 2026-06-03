import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerifyPhase } from "../../components/pipeline/VerifyPhase";

describe("VerifyPhase", () => {
  it("shows three ✓ checks and 100% for a fully passing verdict", () => {
    render(<VerifyPhase category="single" verdict={{ parsed: true, tool_match: true, args_match: true, abstain_correct: null }} />);
    expect(screen.getByText("JSON Regex Extraction")).toBeTruthy();
    expect(screen.getByText("Tool Name Key Match")).toBeTruthy();
    expect(screen.getByText("Parameter Type Validation")).toBeTruthy();
    expect(screen.getByTestId("pipeline-verify-success")).toHaveTextContent("100% SUCCESS");
  });

  it("drops below 100% when a check fails", () => {
    render(<VerifyPhase category="single" verdict={{ parsed: true, tool_match: true, args_match: false, abstain_correct: null }} />);
    expect(screen.getByTestId("pipeline-verify-success")).toHaveTextContent("67% SUCCESS");
  });

  it("shows a single abstention check for abstain tasks", () => {
    render(<VerifyPhase category="abstain" verdict={{ parsed: false, tool_match: false, args_match: false, abstain_correct: true }} />);
    expect(screen.getByText("Correct Abstention")).toBeTruthy();
    expect(screen.getByTestId("pipeline-verify-success")).toHaveTextContent("100% SUCCESS");
  });
});
