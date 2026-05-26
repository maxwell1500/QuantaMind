import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../shared/ipc/storage", () => ({
  getInstalledModelsWithStats: vi.fn().mockResolvedValue([]),
}));

import { invoke } from "@tauri-apps/api/core";
import { getInstalledModelsWithStats } from "../../../shared/ipc/storage";
import { RefreshButton } from "../RefreshButton";
import { useWorkspaceStore } from "../../../features/workspace/state/workspaceStore";
import { useInstalledModelsStore } from "../../../features/models/state/installedModelsStore";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(getInstalledModelsWithStats).mockReset().mockResolvedValue([]);
  useWorkspaceStore.setState({ ollamaHealthy: null });
  useInstalledModelsStore.setState({
    list: [], status: "idle", error: null, lastRefreshedAt: null,
  });
});

describe("RefreshButton", () => {
  it("clicks trigger check_ollama_health + installed-models refresh in parallel", async () => {
    vi.mocked(invoke).mockResolvedValue({ available: true, version: "0.24.0" });
    render(<RefreshButton />);
    fireEvent.click(screen.getByTestId("refresh-button"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("check_ollama_health"));
    await waitFor(() => expect(getInstalledModelsWithStats).toHaveBeenCalled());
  });

  it("writes the health result into workspaceStore.ollamaHealthy", async () => {
    vi.mocked(invoke).mockResolvedValue({ available: true, version: "0.24.0" });
    render(<RefreshButton />);
    fireEvent.click(screen.getByTestId("refresh-button"));
    await waitFor(() =>
      expect(useWorkspaceStore.getState().ollamaHealthy).toBe(true),
    );
  });

  it("flips ollamaHealthy to false when the probe reports unavailable", async () => {
    vi.mocked(invoke).mockResolvedValue({ available: false, version: null });
    render(<RefreshButton />);
    fireEvent.click(screen.getByTestId("refresh-button"));
    await waitFor(() =>
      expect(useWorkspaceStore.getState().ollamaHealthy).toBe(false),
    );
  });

  it("re-entrancy guard: a second click while spinning is a no-op", async () => {
    let resolve: ((v: unknown) => void) | null = null;
    vi.mocked(invoke).mockImplementation(() =>
      new Promise((r) => { resolve = r; }),
    );
    render(<RefreshButton />);
    const btn = screen.getByTestId("refresh-button");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(invoke).toHaveBeenCalledTimes(1);
    resolve?.({ available: true, version: null });
  });
});
