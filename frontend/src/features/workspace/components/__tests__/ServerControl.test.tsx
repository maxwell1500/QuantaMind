import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../hooks/useStartOllama", () => ({ useStartOllama: () => ({ start: vi.fn(), status: "idle" }) }));
vi.mock("../../hooks/useStopOllama", () => ({ useStopOllama: () => ({ stop: vi.fn(), status: "idle" }) }));
vi.mock("../../hooks/useStartLlamaServer", () => ({ useStartLlamaServer: () => ({ start: vi.fn(), status: "idle", error: null }) }));
vi.mock("../../hooks/useStopLlamaServer", () => ({ useStopLlamaServer: () => ({ stop: vi.fn(), status: "idle" }) }));
vi.mock("../../hooks/useMlxServer", () => ({ useMlxServer: () => ({ start: vi.fn(), stop: vi.fn(), starting: false, phase: null, error: null }) }));

import { ServerControl } from "../status/ServerControl";
import { useWorkspaceStore } from "../../state/workspaceStore";

beforeEach(() => useWorkspaceStore.setState({ activeBackend: "ollama", ollamaHealthy: false, llamaHealthy: null }));

describe("ServerControl (header)", () => {
  it("shows the Ollama Start/Stop when Ollama is active", () => {
    render(<ServerControl />);
    expect(screen.getByTestId("ollama-start")).toBeInTheDocument();
    expect(screen.queryByTestId("llama-start")).toBeNull();
  });

  it("shows the llama.cpp Start/Stop when llama.cpp is active", () => {
    useWorkspaceStore.setState({ activeBackend: "llama_cpp" });
    render(<ServerControl />);
    expect(screen.getByTestId("llama-start")).toBeInTheDocument();
    expect(screen.queryByTestId("ollama-start")).toBeNull();
  });

  it("shows the MLX Start/Stop when MLX is active", () => {
    useWorkspaceStore.setState({ activeBackend: "mlx", mlxHealthy: false });
    render(<ServerControl />);
    expect(screen.getByTestId("mlx-start")).toBeInTheDocument();
    expect(screen.queryByTestId("llama-start")).toBeNull();
  });
});
