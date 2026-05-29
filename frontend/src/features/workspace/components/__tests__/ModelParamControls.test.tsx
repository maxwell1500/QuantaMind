import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ModelParamControls } from "../prompt/ModelParamControls";
import { useCompareStore } from "../../../compare/state/compareStore";

beforeEach(() => {
  useCompareStore.getState().reset();
  useCompareStore.getState().setSelectedModels([
    { name: "llama3:1b", size_bytes: 1 }, { name: "qwen:7b", size_bytes: 2 },
  ]);
});

describe("ModelParamControls", () => {
  it("defaults to shared params: checked, no per-model cards", () => {
    render(<ModelParamControls />);
    expect(screen.getByTestId("same-params-toggle")).toBeChecked();
    expect(screen.queryByTestId("model-params-llama3:1b")).toBeNull();
  });

  it("unchecking reveals a parameter card per selected model", () => {
    render(<ModelParamControls />);
    fireEvent.click(screen.getByTestId("same-params-toggle"));
    expect(useCompareStore.getState().useSharedParams).toBe(false);
    expect(screen.getByTestId("model-params-llama3:1b")).toBeInTheDocument();
    expect(screen.getByTestId("model-params-qwen:7b")).toBeInTheDocument();
  });

  it("editing a card stores that model's params override", () => {
    useCompareStore.getState().setUseSharedParams(false);
    render(<ModelParamControls />);
    const card = screen.getByTestId("model-params-llama3:1b");
    const tempInput = card.querySelector("[data-testid='param-temperature-input']") as HTMLInputElement;
    fireEvent.change(tempInput, { target: { value: "0.9" } });
    expect(useCompareStore.getState().perModelParams["llama3:1b"]).toMatchObject({ temperature: 0.9 });
  });
});
