import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@monaco-editor/react", () => ({ default: () => <textarea data-testid="prompt-input" /> }));

import { Workspace } from "../Workspace";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { useCompareStore } from "../../../compare/state/compareStore";

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ activeBackend: "ollama", ollamaHealthy: null });
  useCompareStore.getState().reset();
  useWorkspacesStore.setState({
    root: "/ws", tree: [], currentPath: "/ws/a.quantamind.yaml",
    current: { name: "a", system: "", user: "hi", model: null, params: {}, created_at: "t", updated_at: "t", auto_rerun: false },
    dirty: false,
  });
});

describe("Workspace branches by selection count", () => {
  it("one model → the single-run surface, no compare strategy picker", () => {
    useCompareStore.getState().setSelectedModels([{ name: "llama3.2:1b", size_bytes: 1 }]);
    render(<Workspace />);
    expect(screen.getByTestId("run-status")).toBeTruthy();
    expect(screen.queryByTestId("run-strategy-picker")).toBeNull();
    expect(screen.queryByTestId("multi-toolbar")).toBeNull();
  });

  it("with no model selected, Run is disabled", () => {
    render(<Workspace />);
    expect(screen.getByTestId("run-status")).toBeTruthy();
    expect((screen.getByRole("button", { name: /^run$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("two models → the compare surface with a sequential/parallel picker", () => {
    useCompareStore.getState().setSelectedModels([
      { name: "llama3.2:1b", size_bytes: 1 }, { name: "mistral:7b", size_bytes: 1 },
    ]);
    render(<Workspace />);
    expect(screen.getByTestId("run-strategy-picker")).toBeTruthy();
    expect(screen.getByTestId("multi-toolbar")).toBeTruthy();
    // Single-run surface is not mounted in compare mode.
    expect(screen.queryByTestId("run-status")).toBeNull();
  });
});
