import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { MlxRepoDetail } from "../MlxRepoDetail";
import { useWorkspaceStore } from "../../../workspace/state/workspaceStore";
import { useNavStore } from "../../../../shared/state/navStore";

const card = (pipeline_tag: string | null) => ({
  description: "", license: null, base_model: null, pipeline_tag, tags: [],
});

const mockCard = (c: unknown) =>
  vi.mocked(invoke).mockImplementation((cmd: string) =>
    cmd === "hf_model_card" ? Promise.resolve(c) : Promise.resolve([]),
  );

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useWorkspaceStore.setState({ mlxRepo: null, activeBackend: "ollama" });
  useNavStore.setState({ topView: "models", history: [] });
});

describe("MlxRepoDetail guardrail", () => {
  it("routes a text-generation model straight to Start MLX", async () => {
    mockCard(card("text-generation"));
    render(<MlxRepoDetail repo="mlx-community/Llama-Instruct-4bit" onBack={() => {}} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("hf_model_card", { repo: expect.any(String) }));
    fireEvent.click(screen.getByTestId("mlx-use-button"));
    // No dialog — proceeds immediately.
    expect(screen.queryByTestId("mlx-incompatible-dialog")).toBeNull();
    expect(useWorkspaceStore.getState().mlxRepo).toBe("mlx-community/Llama-Instruct-4bit");
    expect(useWorkspaceStore.getState().activeBackend).toBe("mlx");
    expect(useNavStore.getState().topView).toBe("workspace");
  });

  it("blocks a non-text-generation model with a warning dialog", async () => {
    mockCard(card("text-to-speech"));
    render(<MlxRepoDetail repo="mlx-community/Kokoro-82M-bf16" onBack={() => {}} />);
    await screen.findByTestId("mlx-incompatible-banner");
    fireEvent.click(screen.getByTestId("mlx-use-button"));
    // Guardrail: dialog opens, nothing navigates yet.
    expect(screen.getByTestId("mlx-incompatible-dialog")).toBeInTheDocument();
    expect(useWorkspaceStore.getState().mlxRepo).toBeNull();
    expect(useNavStore.getState().topView).toBe("models");
  });

  it("'Pick another' dismisses without loading the model", async () => {
    mockCard(card("text-to-speech"));
    render(<MlxRepoDetail repo="mlx-community/Kokoro-82M-bf16" onBack={() => {}} />);
    await screen.findByTestId("mlx-incompatible-banner");
    fireEvent.click(screen.getByTestId("mlx-use-button"));
    fireEvent.click(screen.getByTestId("mlx-incompatible-cancel"));
    expect(screen.queryByTestId("mlx-incompatible-dialog")).toBeNull();
    expect(useWorkspaceStore.getState().mlxRepo).toBeNull();
    expect(useNavStore.getState().topView).toBe("models");
  });

  it("'Use anyway' overrides the guardrail and proceeds", async () => {
    mockCard(card("text-to-speech"));
    render(<MlxRepoDetail repo="mlx-community/Kokoro-82M-bf16" onBack={() => {}} />);
    await screen.findByTestId("mlx-incompatible-banner");
    fireEvent.click(screen.getByTestId("mlx-use-button"));
    fireEvent.click(screen.getByTestId("mlx-incompatible-proceed"));
    expect(useWorkspaceStore.getState().mlxRepo).toBe("mlx-community/Kokoro-82M-bf16");
    expect(useWorkspaceStore.getState().activeBackend).toBe("mlx");
    expect(useNavStore.getState().topView).toBe("workspace");
  });

  it("an unknown task (no card) does not block", async () => {
    mockCard(null);
    render(<MlxRepoDetail repo="someone/mystery-mlx" onBack={() => {}} />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("hf_model_card", { repo: expect.any(String) }));
    expect(screen.queryByTestId("mlx-incompatible-banner")).toBeNull();
    fireEvent.click(screen.getByTestId("mlx-use-button"));
    expect(useWorkspaceStore.getState().mlxRepo).toBe("someone/mystery-mlx");
  });
});
