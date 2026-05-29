import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));

import { ModelDropdown } from "../model-select/ModelDropdown";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useCompareStore } from "../../../compare/state/compareStore";

const model = (name: string, size = 1_000_000) =>
  ({ name, size_bytes: size, modified_at: "", family: "llama", parameter_size: "1B", quantization: "Q4", backend: "ollama" as const });

beforeEach(() => {
  vi.clearAllMocks();
  useCompareStore.getState().reset();
  useInstalledModelsStore.setState({
    list: [model("llama3.2:1b"), model("mistral:7b")], status: "ready", error: null,
  });
});

describe("ModelDropdown", () => {
  it("summarizes the current selection on the trigger", () => {
    render(<ModelDropdown />);
    expect(screen.getByTestId("model-dropdown")).toHaveTextContent("Select a model");
    act(() => useCompareStore.setState({ selectedModels: [{ name: "llama3.2:1b", size_bytes: 1 }] }));
    expect(screen.getByTestId("model-dropdown")).toHaveTextContent("llama3.2:1b");
  });

  it("picks a single model", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(within(screen.getByTestId("model-option-llama3.2:1b")).getByRole("checkbox"));
    expect(useCompareStore.getState().selectedModels.map((m) => m.name)).toEqual(["llama3.2:1b"]);
  });

  it("picks multiple models, and toggles one back off", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(within(screen.getByTestId("model-option-llama3.2:1b")).getByRole("checkbox"));
    fireEvent.click(within(screen.getByTestId("model-option-mistral:7b")).getByRole("checkbox"));
    expect(useCompareStore.getState().selectedModels).toHaveLength(2);
    fireEvent.click(within(screen.getByTestId("model-option-llama3.2:1b")).getByRole("checkbox"));
    expect(useCompareStore.getState().selectedModels.map((m) => m.name)).toEqual(["mistral:7b"]);
  });
});
