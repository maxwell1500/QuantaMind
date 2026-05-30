import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../../shared/ipc/workspace/prompts", () => ({
  createPrompt: vi.fn().mockResolvedValue("/ws/foo.quantamind.yaml"),
  loadPrompt: vi.fn().mockResolvedValue({
    name: "foo", system: "", user: "", model: null, params: {},
    created_at: "t", updated_at: "t", auto_rerun: false,
  }),
  savePrompt: vi.fn(),
}));
vi.mock("../../../../shared/ipc/workspace/workspaces", () => ({
  listWorkspaceTree: vi.fn().mockResolvedValue([]),
  recentWorkspaces: vi.fn().mockResolvedValue({ entries: [] }),
  openWorkspace: vi.fn(),
  closeWorkspace: vi.fn(),
  deletePath: vi.fn().mockResolvedValue([]),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn().mockResolvedValue(true), open: vi.fn() }));
vi.mock("../../../../shared/ipc/workspace/history", () => ({
  historyRemoveByPath: vi.fn().mockResolvedValue(undefined),
  historyList: vi.fn().mockResolvedValue([]),
  historyClear: vi.fn().mockResolvedValue(undefined),
}));

import { FilesPanel } from "../FilesPanel";
import { useWorkspacesStore } from "../../state/workspaceStore";
import { useUiStore } from "../../../../shared/state/uiStore";
import { createPrompt } from "../../../../shared/ipc/workspace/prompts";

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspacesStore.setState({ root: "/ws", tree: [], currentPath: null, current: null, dirty: false });
  useUiStore.setState({ creatingPrompt: false });
});

describe("FilesPanel inline create", () => {
  it("shows an inline input when + New is clicked (no window.prompt)", () => {
    render(<FilesPanel />);
    fireEvent.click(screen.getByTestId("files-new"));
    expect(screen.getByTestId("files-new-input")).toBeTruthy();
  });

  it("Enter on the input creates the prompt with the typed name", async () => {
    useUiStore.setState({ creatingPrompt: true });
    render(<FilesPanel />);
    const input = screen.getByTestId("files-new-input");
    fireEvent.change(input, { target: { value: "my-prompt" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(createPrompt).toHaveBeenCalledWith("/ws", "my-prompt"));
  });

  it("Escape cancels without creating", () => {
    useUiStore.setState({ creatingPrompt: true });
    render(<FilesPanel />);
    fireEvent.keyDown(screen.getByTestId("files-new-input"), { key: "Escape" });
    expect(useUiStore.getState().creatingPrompt).toBe(false);
    expect(createPrompt).not.toHaveBeenCalled();
  });
});
