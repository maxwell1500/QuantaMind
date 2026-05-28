import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../../shared/ipc/workspaces", () => ({
  openWorkspace: vi.fn().mockResolvedValue([{ kind: "file", name: "a.quantamind.yaml", path: "/ws/a.quantamind.yaml" }]),
  listWorkspaceTree: vi.fn().mockResolvedValue([]),
  closeWorkspace: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../../shared/ipc/prompts", () => ({
  loadPrompt: vi.fn().mockResolvedValue({
    name: "a", system: "sys", user: "usr", model: null, params: {},
    created_at: "t", updated_at: "t", auto_rerun: false,
  }),
  savePrompt: vi.fn().mockImplementation((_p, f) => Promise.resolve({ ...f, updated_at: "later" })),
}));

import { useWorkspacesStore } from "../workspaceStore";
import { savePrompt } from "../../../../shared/ipc/prompts";

beforeEach(() => {
  useWorkspacesStore.setState({
    root: null, tree: [], currentPath: null, current: null, dirty: false,
  });
  vi.clearAllMocks();
});

describe("workspaceStore", () => {
  it("open sets root and tree, clears selection", async () => {
    await useWorkspacesStore.getState().open("/ws");
    const s = useWorkspacesStore.getState();
    expect(s.root).toBe("/ws");
    expect(s.tree).toHaveLength(1);
    expect(s.current).toBeNull();
  });

  it("selectPrompt loads the file and clears dirty", async () => {
    useWorkspacesStore.setState({ dirty: true });
    await useWorkspacesStore.getState().selectPrompt("/ws/a.quantamind.yaml");
    const s = useWorkspacesStore.getState();
    expect(s.current?.user).toBe("usr");
    expect(s.currentPath).toBe("/ws/a.quantamind.yaml");
    expect(s.dirty).toBe(false);
  });

  it("patch updates current and marks dirty", async () => {
    await useWorkspacesStore.getState().selectPrompt("/ws/a.quantamind.yaml");
    useWorkspacesStore.getState().patch({ user: "edited" });
    const s = useWorkspacesStore.getState();
    expect(s.current?.user).toBe("edited");
    expect(s.dirty).toBe(true);
  });

  it("patch is a no-op when nothing is selected", () => {
    useWorkspacesStore.getState().patch({ user: "x" });
    expect(useWorkspacesStore.getState().dirty).toBe(false);
  });

  it("save persists and clears dirty", async () => {
    await useWorkspacesStore.getState().selectPrompt("/ws/a.quantamind.yaml");
    useWorkspacesStore.getState().patch({ user: "edited" });
    await useWorkspacesStore.getState().save();
    expect(savePrompt).toHaveBeenCalledOnce();
    expect(useWorkspacesStore.getState().dirty).toBe(false);
  });

  it("clearSelection drops the current prompt", async () => {
    await useWorkspacesStore.getState().selectPrompt("/ws/a.quantamind.yaml");
    useWorkspacesStore.getState().clearSelection();
    expect(useWorkspacesStore.getState().current).toBeNull();
  });
});
