import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));
vi.mock("@monaco-editor/react", () => ({ default: () => <textarea data-testid="prompt-input" /> }));

import { Workspace } from "../Workspace";
import { useWorkspacesStore } from "../../../workspaces/state/workspaceStore";
import { useCompareStore } from "../../../compare/state/compareStore";

const m = (name: string) => ({ name, size_bytes: 1_000_000 });

beforeEach(() => {
  vi.clearAllMocks();
  useCompareStore.getState().reset();
  useWorkspacesStore.setState({
    root: "/ws", tree: [], currentPath: "/ws/a.quantamind.yaml",
    current: { name: "a", system: "", user: "hi", model: null, params: {}, created_at: "t", updated_at: "t", auto_rerun: false },
    dirty: false,
  });
});

describe("Workspace mode is driven by model count", () => {
  it("one model → single-run surface (no compare toolbar)", () => {
    useCompareStore.setState({ selectedModels: [m("llama3.2:1b")] });
    render(<Workspace />);
    expect(screen.getByTestId("run-status")).toBeTruthy();
    expect(screen.queryByTestId("multi-run")).toBeNull();
  });

  it("two-plus models → compare surface (no single run-status)", () => {
    useCompareStore.setState({ selectedModels: [m("llama3.2:1b"), m("mistral:7b")] });
    render(<Workspace />);
    expect(screen.getByTestId("multi-run")).toBeTruthy();
    expect(screen.queryByTestId("run-status")).toBeNull();
  });

  it("zero models → single-run surface with the Run disabled", () => {
    render(<Workspace />);
    expect(screen.getByTestId("run-status")).toBeTruthy();
    expect((screen.getByRole("button", { name: /^run$/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
