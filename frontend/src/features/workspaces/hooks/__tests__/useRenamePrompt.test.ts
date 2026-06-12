import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../../../shared/ipc/workspace/prompts", () => ({
  renamePath: vi.fn().mockResolvedValue(undefined),
  loadPrompt: vi.fn().mockResolvedValue({
    name: "x", system: "", user: "", model: null, params: {},
    created_at: "t", updated_at: "t", auto_rerun: false,
  }),
}));
vi.mock("../../../../shared/ipc/workspace/workspaces", () => ({
  listWorkspaceTree: vi.fn().mockResolvedValue([]),
}));

import { useRenamePrompt } from "../useRenamePrompt";
import { useWorkspacesStore } from "../../state/workspaceStore";
import { renamePath } from "../../../../shared/ipc/workspace/prompts";

beforeEach(() => {
  vi.clearAllMocks();
  useWorkspacesStore.setState({ root: "/ws", currentPath: null, current: null });
});

describe("useRenamePrompt", () => {
  it("renames in place, keeping the directory and .quantamind.yaml suffix", async () => {
    const { result } = renderHook(() => useRenamePrompt());
    await result.current("/ws/sub/old.quantamind.yaml", "fresh");
    expect(renamePath).toHaveBeenCalledWith(
      "/ws/sub/old.quantamind.yaml",
      "/ws/sub/fresh.quantamind.yaml",
    );
  });

  it("strips a .quantamind.yaml suffix the user types", async () => {
    const { result } = renderHook(() => useRenamePrompt());
    await result.current("/ws/old.quantamind.yaml", "fresh.quantamind.yaml");
    expect(renamePath).toHaveBeenCalledWith(
      "/ws/old.quantamind.yaml",
      "/ws/fresh.quantamind.yaml",
    );
  });

  it("no-ops on an empty name", async () => {
    const { result } = renderHook(() => useRenamePrompt());
    await result.current("/ws/old.quantamind.yaml", "   ");
    expect(renamePath).not.toHaveBeenCalled();
  });

  it("no-ops when the name is unchanged", async () => {
    const { result } = renderHook(() => useRenamePrompt());
    await result.current("/ws/old.quantamind.yaml", "old");
    expect(renamePath).not.toHaveBeenCalled();
  });
});
