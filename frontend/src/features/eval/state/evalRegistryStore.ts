import { create } from "zustand";
import {
  getBuiltinTasks,
  listCustomCollections,
  loadCustomCollection,
  saveCustomCollection,
  deleteCustomCollection,
  importCustomCollection,
  type ToolTask,
} from "../../../shared/ipc/eval/registry";

/// The sentinel for the bundled curated suite (vs a named custom collection).
export const BUILTIN = "builtin";

interface EvalRegistryStore {
  builtin: ToolTask[];
  collections: string[]; // custom collection names
  selected: string; // BUILTIN or a collection name
  tasks: ToolTask[]; // the active task set for the current selection
  init: () => Promise<void>;
  select: (name: string) => Promise<void>;
  save: (name: string, tasks: ToolTask[]) => Promise<void>;
  remove: (name: string) => Promise<void>;
  importFile: (path: string) => Promise<void>;
}

/// Holds the available datasets (built-in + user collections) and the active
/// selection. The runner is always handed `tasks` — it never reads files.
export const useEvalRegistryStore = create<EvalRegistryStore>((set, get) => ({
  builtin: [],
  collections: [],
  selected: BUILTIN,
  tasks: [],
  init: async () => {
    const [builtin, collections] = await Promise.all([getBuiltinTasks(), listCustomCollections()]);
    set({ builtin, collections, tasks: builtin, selected: BUILTIN });
  },
  select: async (name) => {
    if (name === BUILTIN) {
      set({ selected: BUILTIN, tasks: get().builtin });
      return;
    }
    set({ selected: name, tasks: await loadCustomCollection(name) });
  },
  save: async (name, tasks) => {
    await saveCustomCollection(name, tasks);
    set({ collections: await listCustomCollections() });
    await get().select(name);
  },
  remove: async (name) => {
    await deleteCustomCollection(name);
    set({ collections: await listCustomCollections() });
    if (get().selected === name) await get().select(BUILTIN);
  },
  importFile: async (path) => {
    const name = await importCustomCollection(path);
    set({ collections: await listCustomCollections() });
    await get().select(name);
  },
}));
