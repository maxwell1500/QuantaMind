import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));

import { ModelDropdown } from "../model-select/ModelDropdown";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

const model = (name: string, backend: "ollama" | "llama_cpp") =>
  ({ name, size_bytes: 1_000_000, modified_at: "", family: "x", parameter_size: "1B",
     quantization: "Q4", backend });

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ activeBackend: "ollama", selectedModel: null });
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

  it("clears the selection when it isn't in the active backend (switch)", () => {
    useWorkspaceStore.setState({ selectedModel: "llama3:1b" });
    render(<ModelDropdown />);
    act(() => useWorkspaceStore.getState().setActiveBackend("llama_cpp"));
    expect(useWorkspaceStore.getState().selectedModel).toBeNull();
  });

  it("prunes a stale selection that has no row on this backend", () => {
    // On Ollama, a leaked llama.cpp pick (no row here) is dropped automatically.
    useWorkspaceStore.setState({ activeBackend: "ollama", selectedModel: "phi3" });
    render(<ModelDropdown />);
    expect(useWorkspaceStore.getState().selectedModel).toBeNull();
  });
});
