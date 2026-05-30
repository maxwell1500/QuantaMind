import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));

import { ModelDropdown } from "../model-select/ModelDropdown";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useCompareStore } from "../../../compare/state/compareStore";

const model = (name: string, backend: "ollama" | "llama_cpp") =>
  ({ name, size_bytes: 1_000_000, modified_at: "", family: "x", parameter_size: "1B",
     quantization: "Q4", backend });

const names = () => useCompareStore.getState().selectedModels.map((m) => m.name);

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ activeBackend: "ollama" });
  useCompareStore.getState().reset();
  useInstalledModelsStore.setState({
    list: [model("llama3:1b", "ollama"), model("phi3", "llama_cpp"), model("qwen", "llama_cpp")],
    status: "ready", error: null,
  });
});

describe("ModelDropdown backend scoping", () => {
  it("shows only the active backend's models", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    expect(screen.getByTestId("model-option-llama3:1b")).toBeInTheDocument();
    expect(screen.queryByTestId("model-option-phi3")).toBeNull();
  });

  it("lists llama.cpp models when that backend is active", () => {
    act(() => useWorkspaceStore.setState({ activeBackend: "llama_cpp" }));
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    expect(screen.getByTestId("model-option-phi3")).toBeInTheDocument();
    expect(screen.queryByTestId("model-option-llama3:1b")).toBeNull();
  });

  it("llama.cpp is single-select: a second pick replaces the first", () => {
    act(() => useWorkspaceStore.setState({ activeBackend: "llama_cpp" }));
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(screen.getByTestId("model-option-phi3"));
    expect(names()).toEqual(["phi3"]);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(screen.getByTestId("model-option-qwen"));
    expect(names()).toEqual(["qwen"]);
  });

  it("clears the selection when it isn't in the active backend (switch)", () => {
    useCompareStore.getState().setSelectedModels([{ name: "llama3:1b", size_bytes: 1 }]);
    render(<ModelDropdown />);
    act(() => useWorkspaceStore.getState().setActiveBackend("llama_cpp"));
    expect(names()).toEqual([]);
  });

  it("prunes a stale selection that has no row on this backend", () => {
    useWorkspaceStore.setState({ activeBackend: "ollama" });
    useCompareStore.getState().setSelectedModels([{ name: "phi3", size_bytes: 1 }]);
    render(<ModelDropdown />);
    expect(names()).toEqual([]);
  });
});
