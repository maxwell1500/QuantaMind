import { describe, it, expect } from "vitest";
import { currentStep } from "../steps";

describe("currentStep", () => {
  it("starts at ollama when not healthy", () => {
    expect(currentStep(null, 0)).toBe("ollama");
    expect(currentStep(false, 5)).toBe("ollama");
  });

  it("asks for a model once healthy with none installed", () => {
    expect(currentStep(true, 0)).toBe("model");
  });

  it("is ready once healthy with a model", () => {
    expect(currentStep(true, 1)).toBe("ready");
  });
});
