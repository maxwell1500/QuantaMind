import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { invoke } from "@tauri-apps/api/core";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { OllamaEmptyState } from "../components/status/OllamaEmptyState";
import { useWorkspaceStore } from "../state/workspaceStore";
import { useInstalledModelsStore } from "../../models/state/installedModelsStore";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(openExternal).mockReset().mockResolvedValue(undefined);
  useWorkspaceStore.setState({ ollamaHealthy: false });
  useInstalledModelsStore.setState({
    list: [], status: "idle", error: null, lastRefreshedAt: null,
  });
});

describe("OllamaEmptyState", () => {
  it("idle state renders both Start and Install actions", () => {
    render(<OllamaEmptyState />);
    expect(screen.getByText(/Ollama is not running/)).toBeInTheDocument();
    expect(screen.getByTestId("ollama-start-button")).toBeInTheDocument();
    expect(screen.getByTestId("ollama-install-link")).toBeInTheDocument();
  });

  it("clicking Start moves to starting → success and flips ollamaHealthy true", async () => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockResolvedValue({ status: "started", pid: 4242 });
    render(<OllamaEmptyState />);
    fireEvent.click(screen.getByTestId("ollama-start-button"));
    await vi.waitFor(() =>
      expect(screen.getByText(/Ollama started/)).toBeInTheDocument(),
    );
    vi.advanceTimersByTime(1100);
    await vi.waitFor(() =>
      expect(useWorkspaceStore.getState().ollamaHealthy).toBe(true),
    );
    vi.useRealTimers();
  });

  it("not_installed shows install button that calls shell.open", async () => {
    vi.mocked(invoke).mockResolvedValue({
      status: "not_installed", install_url: "https://ollama.com/download",
    });
    render(<OllamaEmptyState />);
    fireEvent.click(screen.getByTestId("ollama-start-button"));
    await waitFor(() => expect(screen.getByTestId("ollama-install-button")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("ollama-install-button"));
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith("https://ollama.com/download"),
    );
  });

  it("start_failed shows error message and Retry triggers another start", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ status: "start_failed", error: "Port 11434 in use" })
      .mockResolvedValueOnce({ status: "start_failed", error: "still in use" });
    render(<OllamaEmptyState />);
    fireEvent.click(screen.getByTestId("ollama-start-button"));
    await waitFor(() =>
      expect(screen.getByTestId("ollama-error-message")).toHaveTextContent(/Port 11434 in use/),
    );
    fireEvent.click(screen.getByTestId("ollama-retry-button"));
    await waitFor(() =>
      expect(screen.getByTestId("ollama-error-message")).toHaveTextContent(/still in use/),
    );
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("install link in idle state also opens the official download page", async () => {
    render(<OllamaEmptyState />);
    fireEvent.click(screen.getByTestId("ollama-install-link"));
    await waitFor(() =>
      expect(openExternal).toHaveBeenCalledWith("https://ollama.com/download"),
    );
  });
});
