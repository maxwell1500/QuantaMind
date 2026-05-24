import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { ModelMultiSelect } from "../components/ModelMultiSelect";
import { useCompareStore } from "../state/compareStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";

const MODELS = [
  { name: "llama3.2:1b", size_bytes: 1_300_000_000, modified_at: "", family: "llama", parameter_size: "1B", quantization: "Q8_0" },
  { name: "qwen2.5:7b", size_bytes: 4_680_000_000, modified_at: "", family: "qwen", parameter_size: "7B", quantization: "Q4_K_M" },
];

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "get_installed_models_with_stats") return Promise.resolve(MODELS);
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
  useCompareStore.getState().reset();
  useInstalledModelsStore.setState({
    list: [], status: "idle", error: null, lastRefreshedAt: null,
  });
});

describe("ModelMultiSelect", () => {
  it("renders a chip per installed model with name + size", async () => {
    render(<ModelMultiSelect />);
    expect(await screen.findByTestId("model-chip-llama3.2:1b")).toHaveTextContent(/llama3\.2:1b/);
    expect(screen.getByTestId("model-chip-qwen2.5:7b")).toHaveTextContent(/qwen2\.5:7b/);
    expect(screen.getByTestId("model-chip-llama3.2:1b")).toHaveTextContent(/GB|MB/);
  });

  it("clicking a chip selects it and updates the store; clicking again deselects", async () => {
    render(<ModelMultiSelect />);
    const chip = await screen.findByTestId("model-chip-llama3.2:1b");
    fireEvent.click(chip);
    expect(useCompareStore.getState().selectedModels.map((m) => m.name)).toEqual(["llama3.2:1b"]);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(useCompareStore.getState().selectedModels).toEqual([]);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("renders empty state when no models are installed", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    render(<ModelMultiSelect />);
    expect(await screen.findByTestId("model-select-empty")).toBeInTheDocument();
  });

  it("surfaces an error + Retry button when the IPC rejects", async () => {
    vi.mocked(invoke).mockRejectedValue({ kind: "inference", message: "Ollama down" });
    render(<ModelMultiSelect />);
    const err = await screen.findByTestId("model-select-error");
    expect(err).toHaveTextContent(/Ollama down/);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("Retry refetches", async () => {
    let calls = 0;
    vi.mocked(invoke).mockImplementation(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject({ kind: "inference", message: "x" })
        : Promise.resolve(MODELS);
    });
    render(<ModelMultiSelect />);
    await screen.findByTestId("model-select-error");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(screen.queryByTestId("model-select-error")).toBeNull());
    expect(screen.getByTestId("model-chip-llama3.2:1b")).toBeInTheDocument();
  });
});
