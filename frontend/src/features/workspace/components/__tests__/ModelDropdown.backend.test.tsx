import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));

import { ModelDropdown } from "../model-select/ModelDropdown";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";
import { useCompareStore } from "../../../compare/state/compareStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

const model = (name: string, backend: "ollama" | "llama_cpp") =>
  ({ name, size_bytes: 1_000_000, modified_at: "", family: "x", parameter_size: "1B",
     quantization: "Q4", backend });

beforeEach(() => {
  vi.clearAllMocks();
  useCompareStore.getState().reset();
  useWorkspaceStore.setState({ activeBackend: "ollama" });
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

  it("is single-select for llama.cpp — a second pick replaces the first", () => {
    act(() => useWorkspaceStore.setState({ activeBackend: "llama_cpp" }));
    render(<ModelDropdown />);
    fireEvent.click(screen.getByTestId("model-dropdown"));
    fireEvent.click(within(screen.getByTestId("model-option-phi3")).getByRole("checkbox"));
    fireEvent.click(within(screen.getByTestId("model-option-qwen")).getByRole("checkbox"));
    expect(useCompareStore.getState().selectedModels.map((m) => m.name)).toEqual(["qwen"]);
  });

  it("clears the selection when the backend switches", () => {
    render(<ModelDropdown />);
    act(() => useCompareStore.setState({ selectedModels: [{ name: "llama3:1b", size_bytes: 1 }] }));
    act(() => useWorkspaceStore.getState().setActiveBackend("llama_cpp"));
    expect(useCompareStore.getState().selectedModels).toEqual([]);
  });

  it("prunes a stale other-backend pick that has no row on this backend", () => {
    // On Ollama, a leaked llama.cpp bare-name selection (no `:latest` row here)
    // must be dropped automatically so it can't linger and inflate the count.
    act(() =>
      useCompareStore.setState({ selectedModels: [
        { name: "llama3:1b", size_bytes: 1 },   // ollama model in the list
        { name: "phi3", size_bytes: 1 },         // llama.cpp-only — not on Ollama
      ] }),
    );
    render(<ModelDropdown />);
    expect(useCompareStore.getState().selectedModels.map((m) => m.name)).toEqual(["llama3:1b"]);
  });
});
