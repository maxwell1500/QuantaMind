import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../../shared/ipc/history", () => ({
  historyList: vi.fn().mockResolvedValue([
    {
      id: "1", prompt_path: "/ws/a.quantamind.yaml", model: "llama3",
      system: "sys", user: "Explain CRDTs in depth", params: { temperature: 0.4 },
      output_preview: "out", output_len: 120, token_count: 30, ran_at: "2026-05-27T10:00:00Z",
    },
  ]),
  historyClear: vi.fn().mockResolvedValue(undefined),
}));

import { HistoryPanel } from "../components/HistoryPanel";
import { useHistoryStore } from "../state/historyStore";
import { useWorkspacesStore } from "../../workspaces/state/workspaceStore";
import { useWorkspaceStore } from "../../workspace/state/workspaceStore";

beforeEach(() => {
  useHistoryStore.setState({ open: false, entries: [] });
  useWorkspacesStore.setState({
    root: "/ws", tree: [], currentPath: "/ws/a.quantamind.yaml",
    current: { name: "a", system: "", user: "", model: null, params: {}, created_at: "t", updated_at: "t", auto_rerun: false },
    dirty: false,
  });
  vi.clearAllMocks();
});

describe("HistoryPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<HistoryPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("loads and lists entries when opened", async () => {
    useHistoryStore.setState({ open: true });
    render(<HistoryPanel />);
    expect(await screen.findByText("llama3")).toBeTruthy();
    expect(screen.getByText("Explain CRDTs in depth")).toBeTruthy();
    expect(screen.getByText(/120 chars · 30 tokens/)).toBeTruthy();
  });

  it("clicking an entry restores prompt inputs and model", async () => {
    useHistoryStore.setState({ open: true });
    render(<HistoryPanel />);
    fireEvent.click(await screen.findByTestId("history-row"));
    expect(useWorkspacesStore.getState().current?.user).toBe("Explain CRDTs in depth");
    expect(useWorkspacesStore.getState().current?.params.temperature).toBe(0.4);
    expect(useWorkspaceStore.getState().selectedModel).toBe("llama3");
  });

  it("clear empties the list", async () => {
    useHistoryStore.setState({ open: true });
    render(<HistoryPanel />);
    await screen.findByTestId("history-row");
    fireEvent.click(screen.getByText("Clear"));
    await waitFor(() => expect(useHistoryStore.getState().entries).toHaveLength(0));
  });
});
