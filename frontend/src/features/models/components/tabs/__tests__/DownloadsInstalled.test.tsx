import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../../../../../shared/ipc/models/storage", () => ({
  getInstalledModelsWithStats: vi.fn(),
  removeModel: vi.fn(),
}));
vi.mock("../../../../../shared/ipc/models/gguf", () => ({ installLocalGguf: vi.fn() }));
vi.mock("../../../../../shared/ui/Toast", () => ({ useToast: () => vi.fn() }));

import { getInstalledModelsWithStats, removeModel } from "../../../../../shared/ipc/models/storage";
import { installLocalGguf } from "../../../../../shared/ipc/models/gguf";
import { DownloadsInstalled } from "../DownloadsInstalled";
import { useInstalledModelsStore } from "../../../state/installedModelsStore";

const meta = { family: "phi", parameter_size: "3.8B", quantization: "Q4_K_M", modified_at: "", size_bytes: 2_400_000_000 };
const ollama = { ...meta, name: "phi3.5:latest", backend: "ollama" as const };
const llama = { ...meta, name: "phi-4-mini", backend: "llama_cpp" as const, path: "/g/phi-4-mini.gguf" };

beforeEach(() => {
  vi.mocked(getInstalledModelsWithStats).mockReset().mockResolvedValue([]);
  vi.mocked(removeModel).mockReset().mockResolvedValue(undefined);
  vi.mocked(installLocalGguf).mockReset().mockResolvedValue(undefined);
  useInstalledModelsStore.setState({ list: [], status: "ready", error: null, lastRefreshedAt: null });
});

describe("DownloadsInstalled", () => {
  it("shows the empty state when nothing is installed", () => {
    render(<DownloadsInstalled />);
    expect(screen.getByTestId("downloads-empty-installed")).toBeInTheDocument();
  });

  it("shows an Ollama badge + Delete for an Ollama model", () => {
    useInstalledModelsStore.setState({ list: [ollama], status: "ready" });
    render(<DownloadsInstalled />);
    const row = screen.getByTestId("download-installed-phi3.5");
    expect(row).toHaveTextContent("Ollama");
    expect(screen.getByRole("button", { name: /delete phi3\.5/i })).toBeInTheDocument();
  });

  it("offers Add to Ollama for a folder-only model and imports it", async () => {
    useInstalledModelsStore.setState({ list: [llama], status: "ready" });
    render(<DownloadsInstalled />);
    expect(screen.getByTestId("download-installed-phi-4-mini")).toHaveTextContent("llama.cpp");
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    fireEvent.click(screen.getByTestId("add-to-ollama-phi-4-mini"));
    await waitFor(() =>
      expect(installLocalGguf).toHaveBeenCalledWith("/g/phi-4-mini.gguf", "phi-4-mini"),
    );
  });

  it("collapses a model present in both into one row with both badges, no Add button", () => {
    useInstalledModelsStore.setState({
      list: [{ ...llama, name: "phi-4-mini" }, { ...ollama, name: "phi-4-mini:latest" }],
      status: "ready",
    });
    render(<DownloadsInstalled />);
    const row = screen.getByTestId("download-installed-phi-4-mini");
    expect(row).toHaveTextContent("Ollama");
    expect(row).toHaveTextContent("llama.cpp");
    expect(screen.queryByTestId("add-to-ollama-phi-4-mini")).toBeNull();
  });

  it("Delete confirms then removes the Ollama tag and refreshes", async () => {
    useInstalledModelsStore.setState({ list: [ollama], status: "ready" });
    render(<DownloadsInstalled />);
    fireEvent.click(screen.getByRole("button", { name: /delete phi3\.5/i }));
    expect(screen.getByTestId("downloads-confirm-delete")).toHaveTextContent("phi3.5:latest");
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(removeModel).toHaveBeenCalledWith("phi3.5:latest"));
  });
});
