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
  createPrompt: vi.fn().mockImplementation((root, name) => Promise.resolve(`${root}/${name}.quantamind.yaml`)),
}));

import { useWorkspacesStore } from "../workspaceStore";
import { savePrompt, createPrompt } from "../../../../shared/ipc/prompts";

const draft = (name = "note") => ({
  name, system: "", user: "hi", model: null, params: {},
  created_at: "", updated_at: "", auto_rerun: false,
});

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

  it("saveDraftAuto persists an unsaved draft under its (deduped) name", async () => {
    useWorkspacesStore.setState({
      root: "/ws", currentPath: null, current: draft("note"),
      tree: [{ kind: "file", name: "note.quantamind.yaml", path: "/ws/note.quantamind.yaml" }],
    });
    await useWorkspacesStore.getState().saveDraftAuto();
    expect(createPrompt).toHaveBeenCalledWith("/ws", "note-2");
    expect(useWorkspacesStore.getState().currentPath).toBe("/ws/note-2.quantamind.yaml");
  });

  it("saveDraftAuto is a no-op once the prompt is saved (currentPath set)", async () => {
    useWorkspacesStore.setState({ root: "/ws", currentPath: "/ws/a.quantamind.yaml", current: draft() });
    await useWorkspacesStore.getState().saveDraftAuto();
    expect(createPrompt).not.toHaveBeenCalled();
  });
});
