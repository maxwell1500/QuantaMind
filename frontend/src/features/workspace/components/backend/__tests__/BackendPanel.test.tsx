import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

import { BackendPanel } from "../BackendPanel";
import { useWorkspaceStore } from "../../../state/workspaceStore";
import { useUiStore } from "../../../../../shared/state/uiStore";

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ activeBackend: "ollama", ollamaHealthy: null, llamaHealthy: null });
  useUiStore.setState({ backendPanelVisible: true });
});

describe("BackendPanel", () => {
  it("lists Ollama and llama.cpp", () => {
    render(<BackendPanel />);
    expect(screen.getByTestId("backend-ollama")).toHaveTextContent("Ollama");
    expect(screen.getByTestId("backend-llama_cpp")).toHaveTextContent("llama.cpp");
  });

  it("clicking a backend makes it active", () => {
    render(<BackendPanel />);
    fireEvent.click(screen.getByTestId("backend-llama_cpp"));
    expect(useWorkspaceStore.getState().activeBackend).toBe("llama_cpp");
    expect(screen.getByTestId("backend-llama_cpp")).toHaveAttribute("aria-pressed", "true");
  });

  it("collapses and re-opens via the toggle", () => {
    render(<BackendPanel />);
    fireEvent.click(screen.getByTestId("backend-panel-close"));
    expect(useUiStore.getState().backendPanelVisible).toBe(false);
  });

  it("shows an open button when collapsed", () => {
    useUiStore.setState({ backendPanelVisible: false });
    render(<BackendPanel />);
    expect(screen.getByTestId("backend-panel-open")).toBeInTheDocument();
    expect(screen.queryByTestId("backend-panel")).toBeNull();
  });
});
