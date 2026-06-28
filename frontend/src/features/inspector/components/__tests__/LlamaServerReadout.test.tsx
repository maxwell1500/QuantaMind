import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../../../../shared/ipc/models/llama_start", () => ({
  llamaServerInfo: vi.fn(),
}));

import { LlamaServerReadout } from "../server/LlamaServerReadout";
import { llamaServerInfo } from "../../../../shared/ipc/models/llama_start";
import { useBackendStore } from "../../../../shared/state/backendStore";

beforeEach(() => {
  vi.mocked(llamaServerInfo).mockReset();
  useBackendStore.setState({ selectedBackend: "llama_cpp", llamaHealthy: true });
});

describe("LlamaServerReadout", () => {
  it("shows the one-time spawn readout for llama.cpp", async () => {
    vi.mocked(llamaServerInfo).mockResolvedValue({ model_bytes: 4_600_000_000, load_ms: 7000 });
    render(<LlamaServerReadout />);
    await waitFor(() => expect(screen.getByTestId("llama-spawn-readout")).toBeInTheDocument());
    expect(screen.getByTestId("llama-spawn-readout")).toHaveTextContent(/loaded in 7\.0s at startup/);
    expect(screen.getByTestId("llama-spawn-readout")).toHaveTextContent(/not a per-request phase/);
  });

  it("renders nothing for Ollama (no fabricated llama readout)", () => {
    useBackendStore.setState({ selectedBackend: "ollama" });
    render(<LlamaServerReadout />);
    expect(screen.queryByTestId("llama-spawn-readout")).toBeNull();
    expect(llamaServerInfo).not.toHaveBeenCalled();
  });

  it("renders nothing when no server readout is available", async () => {
    vi.mocked(llamaServerInfo).mockResolvedValue(null);
    render(<LlamaServerReadout />);
    await waitFor(() => expect(llamaServerInfo).toHaveBeenCalled());
    expect(screen.queryByTestId("llama-spawn-readout")).toBeNull();
  });
});
