import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

import { BackendList } from "../BackendList";
import { useWorkspaceStore } from "../../../state/workspaceStore";

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ activeBackend: "ollama", ollamaHealthy: null, llamaHealthy: null });
});

describe("BackendList", () => {
  it("lists Ollama and llama.cpp", () => {
    render(<BackendList />);
    expect(screen.getByTestId("backend-ollama")).toHaveTextContent("Ollama");
    expect(screen.getByTestId("backend-llama_cpp")).toHaveTextContent("llama.cpp");
  });

  it("clicking a backend makes it active", () => {
    render(<BackendList />);
    fireEvent.click(screen.getByTestId("backend-llama_cpp"));
    expect(useWorkspaceStore.getState().activeBackend).toBe("llama_cpp");
    expect(screen.getByTestId("backend-llama_cpp")).toHaveAttribute("aria-pressed", "true");
  });
});
