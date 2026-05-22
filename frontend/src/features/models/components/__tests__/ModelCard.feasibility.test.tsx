import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { invoke } from "@tauri-apps/api/core";
import { ModelCard } from "../ModelCard";
import { useModelStore } from "../../state/modelStore";
import type { ModelCatalogEntry } from "../../data/ollama-catalog";

const PHI: ModelCatalogEntry = {
  name: "phi3.5:latest", family: "phi", parameterSize: "3.8B",
  description: "x", estimatedDiskGB: 2.2, tags: ["chat", "small"],
  defaultQuantization: "Q4_K_M",
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  useModelStore.setState({ activeTab: "ollama", installInFlight: null });
});

describe("ModelCard — feasibility gating (M.6)", () => {
  it("Warning feasibility opens dialog; Continue proceeds to install", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "check_install_feasibility")
        return Promise.resolve({ kind: "warning", free_after_bytes: 5_000_000_000 });
      if (cmd === "pull_model") return Promise.resolve("pid-1");
      return Promise.resolve();
    });
    render(<ModelCard model={PHI} isInstalled={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /install/i }));
    });
    const dialog = await screen.findByTestId("feasibility-dialog");
    expect(dialog).toHaveAttribute("data-kind", "warning");
    expect(invoke).not.toHaveBeenCalledWith("pull_model", expect.anything());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    });
    expect(invoke).toHaveBeenCalledWith("pull_model", { name: "phi3.5:latest" });
    expect(screen.queryByTestId("feasibility-dialog")).toBeNull();
  });

  it("Blocked feasibility shows dialog (no Continue); OK dismisses without installing", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "check_install_feasibility")
        return Promise.resolve({
          kind: "blocked_insufficient_space",
          free_after_bytes: 0,
          free_bytes: 1_000_000_000,
          needed_bytes: 2_400_000_000,
        });
      return Promise.resolve();
    });
    render(<ModelCard model={PHI} isInstalled={false} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /install/i }));
    });
    const dialog = await screen.findByTestId("feasibility-dialog");
    expect(dialog).toHaveAttribute("data-kind", "blocked_insufficient_space");
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^ok$/i }));
    expect(screen.queryByTestId("feasibility-dialog")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("pull_model", expect.anything());
  });
});
