import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import { ModelCard } from "../ModelCard";
import { useModelStore } from "../../state/modelStore";
import type { ModelCatalogEntry } from "../../data/ollama-catalog";

const PHI: ModelCatalogEntry = {
  name: "phi3.5:latest",
  family: "phi",
  parameterSize: "3.8B",
  description: "Test description",
  estimatedDiskGB: 2.2,
  tags: ["chat", "small"],
  defaultQuantization: "Q4_K_M",
};

const handlers: Record<string, EventCallback<unknown>> = {};
const fire = (event: string, payload: unknown) =>
  handlers[event]({ event, id: 0, payload });

beforeEach(() => {
  for (const k of Object.keys(handlers)) delete handlers[k];
  vi.mocked(invoke).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(listen).mockImplementation((event, cb) => {
    handlers[event] = cb as EventCallback<unknown>;
    return Promise.resolve(() => { delete handlers[event]; });
  });
  useModelStore.setState({ activeTab: "ollama", installInFlight: null });
});

describe("ModelCard (M.4)", () => {
  it("renders model name, family/size/quant subline, description and disk", () => {
    render(<ModelCard model={PHI} isInstalled={false} />);
    expect(screen.getByText("phi3.5:latest")).toBeInTheDocument();
    expect(screen.getByText(/phi · 3\.8B · Q4_K_M/)).toBeInTheDocument();
    expect(screen.getByText("Test description")).toBeInTheDocument();
    expect(screen.getByText("2.2GB")).toBeInTheDocument();
  });

  it("renders 'Installed ✓' badge when isInstalled=true", () => {
    render(<ModelCard model={PHI} isInstalled />);
    expect(screen.getByTestId("installed-badge")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /install/i })).toBeNull();
  });

  it("clicking Install invokes pull_model with the model name", async () => {
    vi.mocked(invoke).mockResolvedValue("pid-1");
    render(<ModelCard model={PHI} isInstalled={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /install/i }));
    });
    expect(invoke).toHaveBeenCalledWith("pull_model", { name: "phi3.5:latest" });
  });

  it("during pull, card shows 'Installing · N%' and updates modelStore.installInFlight", async () => {
    vi.mocked(invoke).mockResolvedValue("pid-1");
    render(<ModelCard model={PHI} isInstalled={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /install/i }));
    });
    act(() => fire("pull-progress", {
      pull_id: "pid-1",
      progress: { phase: "downloading", digest: "sha256:x", total: 1000, completed: 250, speed_bps: 100 },
    }));
    expect(screen.getByTestId("installing-state")).toHaveTextContent("Installing · 25%");
    expect(useModelStore.getState().installInFlight?.name).toBe("phi3.5:latest");
    expect(useModelStore.getState().installInFlight?.progress).toBe(25);
  });

  it("after success, badge swaps to Installed and installInFlight clears", async () => {
    vi.mocked(invoke).mockResolvedValue("pid-1");
    render(<ModelCard model={PHI} isInstalled={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /install/i }));
    });
    act(() => fire("pull-progress", { pull_id: "pid-1", progress: { phase: "success" } }));
    expect(screen.getByTestId("installed-badge")).toBeInTheDocument();
    expect(useModelStore.getState().installInFlight).toBeNull();
  });
});
