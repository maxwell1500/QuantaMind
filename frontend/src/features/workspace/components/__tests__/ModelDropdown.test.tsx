import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));

import { ModelDropdown } from "../model-select/ModelDropdown";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

const model = (name: string, size = 1_000_000) =>
  ({ name, size_bytes: size, modified_at: "", family: "llama", parameter_size: "1B", quantization: "Q4", backend: "ollama" as const });

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ selectedModel: null, activeBackend: "ollama" });
  useInstalledModelsStore.setState({
    list: [model("llama3.2:1b"), model("mistral:7b")], status: "ready", error: null,
  });
});

describe("ModelDropdown (single-select)", () => {
  it("summarizes the current selection on the trigger", () => {
    render(<ModelDropdown />);
    expect(screen.getByTestId("model-dropdown")).toHaveTextContent("Select a model");
    act(() => useWorkspaceStore.setState({ selectedModel: "llama3.2:1b" }));
    expect(screen.getByTestId("model-dropdown")).toHaveTextContent("llama3.2:1b");
  });

  it("picks a model and replaces it on a second pick", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(screen.getByTestId("model-option-llama3.2:1b"));
    expect(useWorkspaceStore.getState().selectedModel).toBe("llama3.2:1b");
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(screen.getByTestId("model-option-mistral:7b"));
    expect(useWorkspaceStore.getState().selectedModel).toBe("mistral:7b");
  });

  it("clicking the selected model again deselects it", () => {
    useWorkspaceStore.setState({ selectedModel: "llama3.2:1b" });
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(screen.getByTestId("model-option-llama3.2:1b"));
    expect(useWorkspaceStore.getState().selectedModel).toBeNull();
  });
});
