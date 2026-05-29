import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../../../../../shared/ipc/models/storage", () => ({
  getInstalledModelsWithStats: vi.fn(),
  removeModel: vi.fn(),
}));
vi.mock("../../../../../shared/ipc/models/llama_start", () => ({
  listLlamaModels: vi.fn().mockResolvedValue([]),
  deleteLlamaModel: vi.fn(),
}));
vi.mock("../../../../../shared/ipc/models/gguf", () => ({ installLocalGguf: vi.fn() }));
vi.mock("../../../../../shared/ui/Toast", () => ({ useToast: () => vi.fn() }));

import { removeModel } from "../../../../../shared/ipc/models/storage";
import { deleteLlamaModel } from "../../../../../shared/ipc/models/llama_start";
import { DownloadsInstalled } from "../DownloadsInstalled";
import { useInstalledModelsStore } from "../../../state/installedModelsStore";

const meta = { family: "phi", parameter_size: "3.8B", quantization: "Q4_K_M", modified_at: "", size_bytes: 100 };
const ollama = { ...meta, name: "phi3.5:latest", backend: "ollama" as const };
const llama = { ...meta, name: "phi-4-mini", backend: "llama_cpp" as const, path: "/g/phi-4-mini.gguf" };
const set = (list: unknown[]) => useInstalledModelsStore.setState({ list: list as never, status: "ready" });

beforeEach(() => {
  vi.mocked(removeModel).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteLlamaModel).mockReset().mockResolvedValue(undefined);
  useInstalledModelsStore.setState({ list: [], status: "ready", error: null, lastRefreshedAt: null });
});

describe("DownloadsInstalled delete", () => {
  it("Ollama-only: Delete removes from Ollama (no llama.cpp checkbox)", async () => {
    set([ollama]);
    render(<DownloadsInstalled />);
    fireEvent.click(screen.getByRole("button", { name: /delete phi3\.5/i }));
    expect(screen.queryByTestId("confirm-also-llama")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(removeModel).toHaveBeenCalledWith("phi3.5:latest"));
    expect(deleteLlamaModel).not.toHaveBeenCalled();
  });

  it("folder-only: Delete removes the GGUF file", async () => {
    set([llama]);
    render(<DownloadsInstalled />);
    fireEvent.click(screen.getByRole("button", { name: /delete phi-4-mini/i }));
    expect(screen.queryByTestId("confirm-also-llama")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(deleteLlamaModel).toHaveBeenCalledWith("/g/phi-4-mini.gguf"));
    expect(removeModel).not.toHaveBeenCalled();
  });

  it("in both: defaults to Ollama-only, keeping the llama.cpp file", async () => {
    set([{ ...llama, name: "dup" }, { ...ollama, name: "dup:latest" }]);
    render(<DownloadsInstalled />);
    fireEvent.click(screen.getByRole("button", { name: /delete dup/i }));
    expect(screen.getByTestId("confirm-also-llama")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(removeModel).toHaveBeenCalledWith("dup:latest"));
    expect(deleteLlamaModel).not.toHaveBeenCalled();
  });

  it("in both: checking the box also deletes the llama.cpp file", async () => {
    set([{ ...llama, name: "dup", path: "/g/dup.gguf" }, { ...ollama, name: "dup:latest" }]);
    render(<DownloadsInstalled />);
    fireEvent.click(screen.getByRole("button", { name: /delete dup/i }));
    fireEvent.click(screen.getByTestId("confirm-also-llama").querySelector("input")!);
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    await waitFor(() => expect(deleteLlamaModel).toHaveBeenCalledWith("/g/dup.gguf"));
    expect(removeModel).toHaveBeenCalledWith("dup:latest");
  });
});
