import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecommendationBanner } from "../components/RecommendationBanner";
import type { ModelVerdict } from "../../../shared/ipc/eval/readiness";

function verdict(model: string, status: ModelVerdict["verdict"]["status"], blocking: string[] = []): ModelVerdict {
  return {
    model,
    backend: "ollama",
    verdict: { status, blocking, conditions: [], path: "prompt_based" },
    avg_steps: null,
    effort: null,
  };
}

describe("RecommendationBanner", () => {
  it("names verdicts[0] as the recommended model when it is Ready", () => {
    const verdicts = [verdict("qwen2.5-coder", "ready"), verdict("other", "not_ready")];
    render(<RecommendationBanner verdicts={verdicts} profileName="Coding agent" />);
    const banner = screen.getByTestId("recommendation-banner");
    expect(banner).toHaveAttribute("data-status", "ready");
    expect(banner).toHaveTextContent("Recommended for Coding agent");
    expect(screen.getByTestId("recommendation-model")).toHaveTextContent("qwen2.5-coder");
    expect(banner).toHaveTextContent("(Ready)");
  });

  it("shows the 'no model is ready — closest' message with the reason when the top pick is NotReady", () => {
    const verdicts = [verdict("llama3.2", "not_ready", ["pass^k 0.40 < 0.80 required"])];
    render(<RecommendationBanner verdicts={verdicts} profileName="Coding agent" />);
    const banner = screen.getByTestId("recommendation-banner");
    expect(banner).toHaveAttribute("data-status", "not_ready");
    expect(banner).toHaveTextContent("No model is ready for Coding agent");
    expect(banner).toHaveTextContent("llama3.2");
    expect(banner).toHaveTextContent("pass^k 0.40 < 0.80 required");
  });

  it("renders nothing for an empty verdict set", () => {
    const { container } = render(<RecommendationBanner verdicts={[]} profileName="X" />);
    expect(container).toBeEmptyDOMElement();
  });
});
