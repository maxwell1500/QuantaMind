import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@monaco-editor/react", () => ({
  default: () => <textarea data-testid="prompt-input" />,
}));

import { invoke } from "@tauri-apps/api/core";
import App from "../App";
import { useCompareStore } from "../features/compare/state/compareStore";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "list_models") return Promise.resolve([]);
    if (cmd === "check_ollama_health")
      return Promise.resolve({ available: true, version: "x" });
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
  useCompareStore.getState().reset();
});

describe("App tab strip", () => {
  it("renders both tabs with Workspace active by default", () => {
    render(<App />);
    expect(screen.getByTestId("view-tab-workspace")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("view-tab-compare")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("view-workspace")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("view-compare")).toHaveAttribute("hidden");
  });

  it("clicking Compare shows the Compare view and hides Workspace", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("view-tab-compare"));
    expect(screen.getByTestId("view-tab-compare")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("view-compare")).not.toHaveAttribute("hidden");
    expect(screen.getByTestId("view-workspace")).toHaveAttribute("hidden");
  });

  it("Compare prompt survives a Workspace round-trip (Zustand-backed)", () => {
    render(<App />);
    fireEvent.click(screen.getByTestId("view-tab-compare"));
    const input = screen.getByTestId("compare-prompt") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Explain CRDTs." } });
    fireEvent.click(screen.getByTestId("view-tab-workspace"));
    fireEvent.click(screen.getByTestId("view-tab-compare"));
    expect((screen.getByTestId("compare-prompt") as HTMLTextAreaElement).value)
      .toBe("Explain CRDTs.");
  });

  it("Workspace's own React state also survives the toggle (both views kept mounted)", () => {
    render(<App />);
    // Workspace owns its prompt in useState; mock Monaco renders a textarea
    // we can type into to verify it survives the round-trip.
    const wsPrompt = screen.getByTestId("prompt-input") as HTMLTextAreaElement;
    fireEvent.change(wsPrompt, { target: { value: "ws value" } });
    fireEvent.click(screen.getByTestId("view-tab-compare"));
    fireEvent.click(screen.getByTestId("view-tab-workspace"));
    expect((screen.getByTestId("prompt-input") as HTMLTextAreaElement).value).toBe("ws value");
  });
});
