import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("../../../../shared/ipc/models/mlx_install", () => ({ installMlxModel: vi.fn() }));
vi.mock("../../../../shared/ipc/models/hf_install", () => ({
  cancelHfInstall: vi.fn(),
  EVENT_HF_PROGRESS: "hf-progress",
}));

import { invoke } from "@tauri-apps/api/core";
import { installMlxModel } from "../../../../shared/ipc/models/mlx_install";
import { MlxRepoDetail } from "../MlxRepoDetail";
import { useModelStore } from "../../state/modelStore";

const card = (pipeline_tag: string | null) => ({
  description: "", license: null, base_model: null, pipeline_tag, tags: [],
});
const mockCard = (c: unknown) =>
  vi.mocked(invoke).mockImplementation((cmd: string) =>
    cmd === "hf_model_card" ? Promise.resolve(c) : Promise.resolve([]),
  );

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(installMlxModel).mockReset().mockResolvedValue(undefined);
  useModelStore.setState({ downloads: {}, activeHfName: null });
});

describe("MlxRepoDetail download + guardrail", () => {
  it("downloads a text-generation model immediately (no dialog)", async () => {
    mockCard(card("text-generation"));
    render(<MlxRepoDetail repo="mlx-community/Llama-Instruct-4bit" onBack={() => {}} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("hf_model_card", { repo: expect.any(String) }));
    await act(async () => { fireEvent.click(screen.getByTestId("mlx-download-button")); });
    expect(screen.queryByTestId("mlx-incompatible-dialog")).toBeNull();
    expect(installMlxModel).toHaveBeenCalledWith("mlx-community/Llama-Instruct-4bit");
  });

  it("blocks a non-text-generation model with a dialog (no download yet)", async () => {
    mockCard(card("text-to-speech"));
    render(<MlxRepoDetail repo="mlx-community/Kokoro-82M-bf16" onBack={() => {}} />);
    await screen.findByTestId("mlx-incompatible-banner");
    fireEvent.click(screen.getByTestId("mlx-download-button"));
    expect(screen.getByTestId("mlx-incompatible-dialog")).toBeInTheDocument();
    expect(installMlxModel).not.toHaveBeenCalled();
  });

  it("'Pick another' dismisses without downloading", async () => {
    mockCard(card("text-to-speech"));
    render(<MlxRepoDetail repo="mlx-community/Kokoro-82M-bf16" onBack={() => {}} />);
    await screen.findByTestId("mlx-incompatible-banner");
    fireEvent.click(screen.getByTestId("mlx-download-button"));
    fireEvent.click(screen.getByTestId("mlx-incompatible-cancel"));
    expect(screen.queryByTestId("mlx-incompatible-dialog")).toBeNull();
    expect(installMlxModel).not.toHaveBeenCalled();
  });

  it("'Download anyway' overrides the guardrail", async () => {
    mockCard(card("text-to-speech"));
    render(<MlxRepoDetail repo="mlx-community/Kokoro-82M-bf16" onBack={() => {}} />);
    await screen.findByTestId("mlx-incompatible-banner");
    fireEvent.click(screen.getByTestId("mlx-download-button"));
    await act(async () => { fireEvent.click(screen.getByTestId("mlx-incompatible-proceed")); });
    expect(installMlxModel).toHaveBeenCalledWith("mlx-community/Kokoro-82M-bf16");
  });

  it("an unknown task (no card) does not block the download", async () => {
    mockCard(null);
    render(<MlxRepoDetail repo="someone/mystery-mlx" onBack={() => {}} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("hf_model_card", { repo: expect.any(String) }));
    expect(screen.queryByTestId("mlx-incompatible-banner")).toBeNull();
    await act(async () => { fireEvent.click(screen.getByTestId("mlx-download-button")); });
    expect(installMlxModel).toHaveBeenCalledWith("someone/mystery-mlx");
  });
});
