import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../../../shared/ipc/client", () => ({
  checkOllamaHealth: vi.fn(),
}));

import { checkOllamaHealth } from "../../../shared/ipc/client";
import { StatusBar } from "../components/StatusBar";
import { useWorkspaceStore } from "../state/workspaceStore";

describe("StatusBar", () => {
  beforeEach(() => {
    vi.mocked(checkOllamaHealth).mockReset();
    useWorkspaceStore.setState({ lastRunMetrics: null });
  });

  it("renders 'no run yet' before any run completes", async () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue({
      available: true,
      version: "0.1.32",
    });
    render(<StatusBar model={null} />);
    expect(screen.getByTestId("status-bar-metrics")).toHaveTextContent(
      "no run yet",
    );
  });

  it("shows green dot + connected when Ollama is up", async () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue({
      available: true,
      version: "0.1.32",
    });
    render(<StatusBar model="llama3.2:1b" />);
    await waitFor(() => {
      expect(screen.getByLabelText("Ollama health")).toHaveTextContent(
        /connected.*0\.1\.32/,
      );
    });
    const dot = screen
      .getByLabelText("Ollama health")
      .querySelector("span") as HTMLElement;
    expect(dot.className).toMatch(/bg-green-500/);
  });

  it("shows red dot + 'Ollama not running' when health is unavailable", async () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue({
      available: false,
      version: null,
    });
    render(<StatusBar model={null} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Ollama health")).toHaveTextContent(
        "Ollama not running",
      );
    });
    const dot = screen
      .getByLabelText("Ollama health")
      .querySelector("span") as HTMLElement;
    expect(dot.className).toMatch(/bg-red-500/);
  });

  it("renders metrics from the store with correct precision", () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue({
      available: true,
      version: null,
    });
    useWorkspaceStore.setState({
      lastRunMetrics: { ttft_ms: 137, tokens_per_sec: 47.345, token_count: 92 },
    });
    render(<StatusBar model="llama3.2:1b" />);
    const m = screen.getByTestId("status-bar-metrics");
    expect(m).toHaveTextContent("TTFT 137ms");
    expect(m).toHaveTextContent("47.3 tok/s");
    expect(m).toHaveTextContent("92 tokens");
  });

  it("invokes onModelClick when the model name is clicked", () => {
    vi.mocked(checkOllamaHealth).mockResolvedValue({
      available: true,
      version: null,
    });
    const onClick = vi.fn();
    render(<StatusBar model="mistral:7b" onModelClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "mistral:7b" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
