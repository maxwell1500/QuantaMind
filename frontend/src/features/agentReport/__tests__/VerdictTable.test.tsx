import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VerdictTable } from "../components/VerdictTable";
import type { ModelVerdict } from "../../../shared/ipc/eval/readiness";

const VERDICTS: ModelVerdict[] = [
  {
    model: "qwen2.5-coder",
    backend: "ollama",
    verdict: { status: "ready", blocking: [], conditions: [], path: "prompt_based" },
  },
  {
    model: "phi3.5",
    backend: "ollama",
    verdict: {
      status: "not_ready",
      blocking: ["pass^k 0.40 < 0.80 required", "loops on some runs"],
      conditions: [],
      path: "prompt_based",
    },
  },
  {
    model: "mistral-nemo",
    backend: "llama_cpp",
    verdict: {
      status: "conditional",
      blocking: [],
      conditions: ["slow: 8400ms/step > 5000ms target"],
      path: "prompt_based",
    },
  },
];

describe("VerdictTable", () => {
  it("renders a status badge per model with the measured path label", () => {
    render(<VerdictTable verdicts={VERDICTS} />);
    expect(screen.getByTestId("readiness-badge-ready")).toHaveTextContent("READY");
    expect(screen.getByTestId("readiness-badge-not_ready")).toHaveTextContent("NOT READY");
    expect(screen.getByTestId("readiness-badge-conditional")).toHaveTextContent("CONDITIONAL");
    // Path transparency: prompt-based, never silently presented as native.
    expect(screen.getByTestId("readiness-row-qwen2.5-coder")).toHaveTextContent("Prompt-Based");
  });

  it("shows the exact interpolated blocking math, not a bare 'failed'", () => {
    render(<VerdictTable verdicts={VERDICTS} />);
    const row = screen.getByTestId("readiness-row-phi3.5");
    expect(row).toHaveTextContent("✗ pass^k 0.40 < 0.80 required");
    expect(row).toHaveTextContent("✗ loops on some runs");
  });

  it("renders conditions as amber notes and a clean Ready row as 'meets all criteria'", () => {
    render(<VerdictTable verdicts={VERDICTS} />);
    expect(screen.getByTestId("readiness-row-mistral-nemo")).toHaveTextContent("! slow: 8400ms/step > 5000ms target");
    expect(screen.getByTestId("readiness-row-qwen2.5-coder")).toHaveTextContent("Meets all criteria");
  });
});
