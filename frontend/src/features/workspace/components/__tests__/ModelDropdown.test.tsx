import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));

import { ModelDropdown } from "../model-select/ModelDropdown";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useCompareStore } from "../../../compare/state/compareStore";

const model = (name: string, size = 1_000_000) =>
  ({ name, size_bytes: size, modified_at: "", family: "llama", parameter_size: "1B", quantization: "Q4", backend: "ollama" as const });

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ activeBackend: "ollama" });
  useCompareStore.getState().reset();
  useInstalledModelsStore.setState({
    list: [model("llama3.2:1b"), model("mistral:7b")], status: "ready", error: null,
  });
});

const names = () => useCompareStore.getState().selectedModels.map((m) => m.name);

describe("ModelDropdown (Ollama multi-select)", () => {
  it("summarizes the selection on the trigger", () => {
    render(<ModelDropdown />);
    expect(screen.getByTestId("model-dropdown")).toHaveTextContent("Select a model");
    act(() => useCompareStore.getState().setSelectedModels([{ name: "llama3.2:1b", size_bytes: 1 }]));
    expect(screen.getByTestId("model-dropdown")).toHaveTextContent("llama3.2:1b");
    act(() => useCompareStore.getState().setSelectedModels([
      { name: "llama3.2:1b", size_bytes: 1 }, { name: "mistral:7b", size_bytes: 1 },
    ]));
    expect(screen.getByTestId("model-dropdown")).toHaveTextContent("2 models");
  });

  it("adds multiple models and keeps the dropdown open", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(screen.getByTestId("model-option-llama3.2:1b"));
    fireEvent.click(screen.getByTestId("model-option-mistral:7b"));
    expect(names()).toEqual(["llama3.2:1b", "mistral:7b"]);
  });

  it("marks selected options with a checkbox tick", () => {
    useCompareStore.getState().setSelectedModels([{ name: "llama3.2:1b", size_bytes: 1 }]);
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    expect(screen.getByTestId("model-option-llama3.2:1b")).toHaveTextContent("✓");
    expect(screen.getByTestId("model-option-mistral:7b")).not.toHaveTextContent("✓");
  });

  it("clicking a selected model again removes it", () => {
    useCompareStore.getState().setSelectedModels([{ name: "llama3.2:1b", size_bytes: 1 }]);
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(screen.getByTestId("model-option-llama3.2:1b"));
    expect(names()).toEqual([]);
  });
});
