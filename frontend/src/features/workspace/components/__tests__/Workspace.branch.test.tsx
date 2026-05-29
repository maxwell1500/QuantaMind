import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@monaco-editor/react", () => ({ default: () => <textarea data-testid="prompt-input" /> }));

import { Workspace } from "../Workspace";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspaceStore.setState({ selectedModel: null, activeBackend: "ollama", ollamaHealthy: null });
  useWorkspacesStore.setState({
    root: "/ws", tree: [], currentPath: "/ws/a.quantamind.yaml",
    current: { name: "a", system: "", user: "hi", model: null, params: {}, created_at: "t", updated_at: "t", auto_rerun: false },
    dirty: false,
  });
});

describe("Workspace is single-model (compare lives in the Bench)", () => {
  it("renders the single-run surface with a selected model", () => {
    useWorkspaceStore.setState({ selectedModel: "llama3.2:1b" });
    render(<Workspace />);
    expect(screen.getByTestId("run-status")).toBeTruthy();
    // No multi-model compare surface in the Workspace anymore.
    expect(screen.queryByTestId("compare-columns")).toBeNull();
  });

  it("with no model selected, Run is disabled", () => {
    render(<Workspace />);
    expect(screen.getByTestId("run-status")).toBeTruthy();
    expect((screen.getByRole("button", { name: /^run$/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
