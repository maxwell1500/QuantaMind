import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock("@monaco-editor/react", () => ({
  default: () => <textarea data-testid="prompt-input" />,
}));

import { invoke } from "@tauri-apps/api/core";
import App from "../App";
import { useCompareStore } from "../features/compare/state/compareStore";
import { useNavStore } from "../shared/state/navStore";
import { useModelStore } from "../features/models/state/modelStore";

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((cmd: string) => {
    if (cmd === "list_models") return Promise.resolve([]);
    if (cmd === "check_ollama_health")
      return Promise.resolve({ available: true, version: "x" });
    if (cmd === "get_installed_models_with_stats") return Promise.resolve([]);
    if (cmd === "get_disk_usage")
      return Promise.resolve({ total_bytes: 1, free_bytes: 1, ollama_models_bytes: 0 });
    if (cmd === "get_storage_path")
      return Promise.resolve({ current_path: "/tmp", from_env: false });
    return Promise.reject(new Error(`unknown ${cmd}`));
  });
  useCompareStore.getState().reset();
  useNavStore.setState({ topView: "workspace" });
  useModelStore.setState({ downloads: {}, pullNames: {}, activeHfName: null, hfSearchQuery: "", hfSelectedRepo: null });
});

const ALL = ["workspace", "compare", "models", "downloads", "storage"] as const;

describe("App tab strip (5 top tabs)", () => {
  it("renders all five tabs with Workspace active by default", () => {
    render(<App />);
    for (const id of ALL) {
      expect(screen.getByTestId(`view-tab-${id}`))
        .toHaveAttribute("aria-selected", id === "workspace" ? "true" : "false");
    }
    expect(screen.getByTestId("view-workspace")).not.toHaveAttribute("hidden");
    for (const id of ALL.filter((x) => x !== "workspace")) {
      expect(screen.getByTestId(`view-${id}`)).toHaveAttribute("hidden");
    }
  });

  it.each(ALL.filter((x) => x !== "workspace"))(
    "clicking the %s tab shows that view and hides Workspace",
    (id) => {
      render(<App />);
      fireEvent.click(screen.getByTestId(`view-tab-${id}`));
      expect(screen.getByTestId(`view-tab-${id}`)).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId(`view-${id}`)).not.toHaveAttribute("hidden");
      expect(screen.getByTestId("view-workspace")).toHaveAttribute("hidden");
      expect(useNavStore.getState().topView).toBe(id);
    },
  );

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
    const userEditor = within(screen.getByTestId("user-prompt-editor"))
      .getByTestId("prompt-input") as HTMLTextAreaElement;
    fireEvent.change(userEditor, { target: { value: "ws value" } });
    fireEvent.click(screen.getByTestId("view-tab-compare"));
    fireEvent.click(screen.getByTestId("view-tab-workspace"));
    const afterToggle = within(screen.getByTestId("user-prompt-editor"))
      .getByTestId("prompt-input") as HTMLTextAreaElement;
    expect(afterToggle.value).toBe("ws value");
  });
});
