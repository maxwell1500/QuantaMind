import { create } from "zustand";
import type { PromptFile } from "../../../shared/ipc/prompts";
import type { TreeNode } from "../../../shared/ipc/workspaces";
import {
  closeWorkspace as ipcClose,
  listWorkspaceTree,
  openWorkspace as ipcOpen,
} from "../../../shared/ipc/workspaces";
import { createPrompt, loadPrompt, savePrompt } from "../../../shared/ipc/prompts";

const blankPrompt = (): PromptFile => ({
  name: "restored", system: "", user: "", model: null, params: {},
  created_at: "", updated_at: "", auto_rerun: false,
});

export interface WorkspaceStoreState {
  root: string | null;
  tree: TreeNode[];
  currentPath: string | null;
  current: PromptFile | null;
  dirty: boolean;
  open: (path: string) => Promise<void>;
  close: () => Promise<void>;
  refreshTree: () => Promise<void>;
  selectPrompt: (path: string) => Promise<void>;
  clearSelection: () => void;
  patch: (p: Partial<PromptFile>) => void;
  save: () => Promise<void>;
  restoreDraft: (fields: Partial<PromptFile>) => void;
  saveAs: (name: string) => Promise<void>;
}

export const useWorkspacesStore = create<WorkspaceStoreState>((set, get) => ({
  root: null,
  tree: [],
  currentPath: null,
  current: null,
  dirty: false,
  open: async (path) => {
    const tree = await ipcOpen(path);
    set({ root: path, tree, currentPath: null, current: null, dirty: false });
  },
  close: async () => {
    await ipcClose();
    set({ root: null, tree: [], currentPath: null, current: null, dirty: false });
  },
  refreshTree: async () => {
    const tree = await listWorkspaceTree();
    set({ tree });
  },
  selectPrompt: async (path) => {
    const current = await loadPrompt(path);
    set({ currentPath: path, current, dirty: false });
  },
  clearSelection: () => set({ currentPath: null, current: null, dirty: false }),
  patch: (p) => set((s) => (s.current ? { current: { ...s.current, ...p }, dirty: true } : s)),
  save: async () => {
    const { currentPath, current } = get();
    if (!currentPath || !current) return;
    const saved = await savePrompt(currentPath, current);
    set({ current: saved, dirty: false });
  },
  // Load history/restored content into a detached draft (currentPath=null)
  // so it never overwrites the open prompt file until the user saves it.
  restoreDraft: (fields) =>
    set({ currentPath: null, current: { ...blankPrompt(), ...fields }, dirty: false }),
  saveAs: async (name) => {
    const { root, current } = get();
    if (!root || !current) return;
    const path = await createPrompt(root, name);
    const saved = await savePrompt(path, { ...current, name });
    const tree = await listWorkspaceTree();
    set({ currentPath: path, current: saved, tree, dirty: false });
  },
}));
