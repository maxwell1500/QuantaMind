import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../../shared/ipc/models/llama_start", () => ({
  startLlamaServer: vi.fn(),
  stopLlamaServer: vi.fn(),
}));

import { startLlamaServer } from "../../../../shared/ipc/models/llama_start";
import { LlamaServerControl } from "../status/LlamaServerControl";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useInstalledModelsStore } from "../../../models/state/installedModelsStore";

const llama = (name: string, path?: string) => ({
  name, size_bytes: 1, modified_at: "", family: "x", parameter_size: "",
  quantization: "Q4", backend: "llama_cpp" as const, path,
});

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ llamaHealthy: null, selectedModel: "phi3" });
  useInstalledModelsStore.setState({ list: [llama("phi3", "/g/phi3.gguf")], status: "ready", error: null });
});

describe("LlamaServerControl", () => {
  it("Start is disabled until a llama.cpp model with a path is selected", () => {
    useWorkspaceStore.setState({ selectedModel: null });
    render(<LlamaServerControl />);
    expect(screen.getByTestId("llama-start")).toBeDisabled();
  });

  it("surfaces a not_bundled error instead of failing silently", async () => {
    vi.mocked(startLlamaServer).mockResolvedValue({ status: "not_bundled", note: "no binary for this platform" });
    render(<LlamaServerControl />);
    fireEvent.click(screen.getByTestId("llama-start"));
    const err = await screen.findByTestId("llama-start-error");
    expect(err).toHaveTextContent(/no binary/i);
  });

  it("surfaces a start_failed error", async () => {
    vi.mocked(startLlamaServer).mockResolvedValue({ status: "start_failed", error: "port in use" });
    render(<LlamaServerControl />);
    fireEvent.click(screen.getByTestId("llama-start"));
    expect(await screen.findByTestId("llama-start-error")).toHaveTextContent(/port in use/i);
  });

  it("shows Stop once the server is healthy", async () => {
    vi.mocked(startLlamaServer).mockResolvedValue({ status: "started", pid: 1, port: 8080 });
    render(<LlamaServerControl />);
    fireEvent.click(screen.getByTestId("llama-start"));
    await waitFor(() => expect(useWorkspaceStore.getState().llamaHealthy).toBe(true));
  });
});
