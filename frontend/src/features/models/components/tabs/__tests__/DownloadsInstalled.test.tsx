import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("../../../../../shared/ipc/models/storage", () => ({
  getInstalledModelsWithStats: vi.fn(),
  removeModel: vi.fn(),
}));
vi.mock("../../../../../shared/ipc/models/gguf", () => ({
  installLocalGguf: vi.fn(),
}));
vi.mock("../../../../../shared/ui/Toast", () => ({ useToast: () => vi.fn() }));

import {
  getInstalledModelsWithStats,
  removeModel,
} from "../../../../../shared/ipc/models/storage";
import { installLocalGguf } from "../../../../../shared/ipc/models/gguf";
import { DownloadsInstalled } from "../DownloadsInstalled";
import { useInstalledModelsStore } from "../../../state/installedModelsStore";

const ollama = {
  name: "phi3.5:latest", family: "phi", parameter_size: "3.8B",
  quantization: "Q4_K_M", size_bytes: 2_400_000_000, modified_at: "2026-05-22",
  backend: "ollama" as const,
};
const llama = {
  name: "phi-4-mini", family: "phi", parameter_size: "4B", quantization: "Q2_K",
  size_bytes: 1_600_000_000, modified_at: "", backend: "llama_cpp" as const,
  path: "/g/phi-4-mini.gguf",
};

beforeEach(() => {
  vi.mocked(getInstalledModelsWithStats).mockReset().mockResolvedValue([]);
  vi.mocked(removeModel).mockReset();
  vi.mocked(installLocalGguf).mockReset().mockResolvedValue(undefined);
  useInstalledModelsStore.setState({ list: [], status: "ready", error: null, lastRefreshedAt: null });
});

describe("DownloadsInstalled", () => {
  it("shows the empty state when nothing is installed", () => {
    render(<DownloadsInstalled />);
    expect(screen.getByTestId("downloads-empty-installed")).toBeInTheDocument();
  });

  it("renders an Ollama model with metadata and a Delete button", () => {
    useInstalledModelsStore.setState({ list: [ollama], status: "ready" });
    render(<DownloadsInstalled />);
    expect(screen.getByTestId("download-installed-ollama-phi3.5:latest")).toHaveTextContent(/3\.8B/);
    expect(screen.getByRole("button", { name: /delete phi3.5:latest/i })).toBeInTheDocument();
  });

  it("offers Add to Ollama for a folder-only llama.cpp model and imports it", async () => {
    useInstalledModelsStore.setState({ list: [llama], status: "ready" });
    render(<DownloadsInstalled />);
    // No Delete (not in Ollama); has Add to Ollama.
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    fireEvent.click(screen.getByTestId("add-to-ollama-phi-4-mini"));
    await waitFor(() =>
      expect(installLocalGguf).toHaveBeenCalledWith("/g/phi-4-mini.gguf", "phi-4-mini"),
    );
  });

  it("hides Add to Ollama once the model is also in Ollama", () => {
    useInstalledModelsStore.setState({
      list: [{ ...llama, name: "phi-4-mini" }, { ...ollama, name: "phi-4-mini" }],
      status: "ready",
    });
    render(<DownloadsInstalled />);
    expect(screen.queryByTestId("add-to-ollama-phi-4-mini")).toBeNull();
  });

  it("Delete confirms then removes and refreshes", async () => {
    useInstalledModelsStore.setState({ list: [ollama], status: "ready" });
    vi.mocked(removeModel).mockResolvedValue(undefined);
    render(<DownloadsInstalled />);
    fireEvent.click(screen.getByRole("button", { name: /delete phi3.5:latest/i }));
    expect(screen.getByTestId("downloads-confirm-delete")).toHaveTextContent("phi3.5:latest");
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(removeModel).toHaveBeenCalledWith("phi3.5:latest"));
  });
});
