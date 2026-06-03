import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { BackendList } from "../BackendList";
import { useWorkspaceStore } from "../../../state/workspaceStore";

const hw = (apple: boolean) => ({
  total_memory_bytes: 16,
  available_memory_bytes: 8,
  is_apple_silicon: apple,
});

function mockInvoke(apple: boolean, mlxAvailable: boolean) {
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_hardware_snapshot") return Promise.resolve(hw(apple));
    if (cmd === "check_mlx_health") return Promise.resolve({ available: mlxAvailable, version: null });
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({
    activeBackend: "ollama",
    ollamaHealthy: null,
    llamaHealthy: null,
    mlxHealthy: null,
  });
});

describe("BackendList", () => {
  it("lists Ollama and llama.cpp", async () => {
    mockInvoke(false, false);
    render(<BackendList />);
    expect(screen.getByTestId("backend-ollama")).toHaveTextContent("Ollama");
    expect(screen.getByTestId("backend-llama_cpp")).toHaveTextContent("llama.cpp");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_hardware_snapshot"));
  });

  it("clicking a backend makes it active", async () => {
    mockInvoke(false, false);
    render(<BackendList />);
    fireEvent.click(screen.getByTestId("backend-llama_cpp"));
    expect(useWorkspaceStore.getState().activeBackend).toBe("llama_cpp");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_hardware_snapshot"));
  });

  it("shows the MLX row on Apple Silicon", async () => {
    mockInvoke(true, true);
    render(<BackendList />);
    expect(await screen.findByTestId("backend-mlx")).toHaveTextContent("MLX");
  });

  it("hides the MLX row off Apple Silicon", async () => {
    mockInvoke(false, false);
    render(<BackendList />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_hardware_snapshot"));
    expect(screen.queryByTestId("backend-mlx")).toBeNull();
  });

  it("shows a not-detected hint when MLX is unreachable on Apple Silicon", async () => {
    mockInvoke(true, false);
    render(<BackendList />);
    expect(await screen.findByTestId("mlx-hint")).toBeTruthy();
  });
});
