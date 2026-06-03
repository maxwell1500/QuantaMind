import { create } from "zustand";
import {
  getBuiltinCollection,
  listBuiltinCollections,
  listCustomCollections,
  loadCustomCollection,
  saveCustomCollection,
  deleteCustomCollection,
  importCustomCollection,
  type ToolTask,
  type BuiltinCollectionInfo,
} from "../../../shared/ipc/eval/registry";

/// The default read-only preset id (the curated suite).
export const DEFAULT_PRESET = "curated";

/// Sentinel `selected` value for an unsaved, brand-new collection. It is never a
/// real preset id nor a sanitized file stem, and is never sent to the backend —
/// it only ever lives in `selected` until the user saves under a real name.
export const NEW_COLLECTION = "__new__";

/// Built-in presets can't be deleted from disk, so "removing" one just hides it
/// from the list (persisted locally). Cleared if the user wants them all back.
const HIDDEN_KEY = "qm-eval-hidden-presets";
function loadHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function saveHidden(ids: string[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
  } catch {
    /* no localStorage (non-browser) — hide is then session-only */
  }
}

interface EvalRegistryStore {
  presets: BuiltinCollectionInfo[]; // read-only built-in collections (id + label), minus hidden
  collections: string[]; // user custom collection names
  selected: string; // a preset id OR a custom collection name
  tasks: ToolTask[]; // the active task set for the current selection
  hiddenPresets: string[]; // preset ids the user removed from the list
  init: () => Promise<void>;
  startNew: () => void; // enter an editable, unsaved new-collection selection
  select: (idOrName: string) => Promise<void>;
  save: (name: string, tasks: ToolTask[]) => Promise<void>;
  remove: (name: string) => Promise<void>;
  hidePreset: (id: string) => void; // "delete" a built-in preset (hide from list)
  importFile: (path: string) => Promise<void>;
  isPreset: (idOrName: string) => boolean;
}

/// Holds the available datasets (read-only built-in presets + user collections)
/// and the active selection. The runner is always handed `tasks`.
export const useEvalRegistryStore = create<EvalRegistryStore>((set, get) => ({
  presets: [],
  collections: [],
  selected: DEFAULT_PRESET,
  tasks: [],
  hiddenPresets: [],
  isPreset: (v) => get().presets.some((p) => p.id === v),
  init: async () => {
    const hidden = loadHidden();
    const [allPresets, collections] = await Promise.all([listBuiltinCollections(), listCustomCollections()]);
    const presets = allPresets.filter((p) => !hidden.includes(p.id));
    set({ presets, collections, hiddenPresets: hidden, tasks: await getBuiltinCollection(DEFAULT_PRESET), selected: DEFAULT_PRESET });
  },
  hidePreset: (id) => {
    const hidden = [...get().hiddenPresets, id];
    saveHidden(hidden);
    set({ hiddenPresets: hidden, presets: get().presets.filter((p) => p.id !== id) });
    if (get().selected === id) void get().select(DEFAULT_PRESET);
  },
  startNew: () => set({ selected: NEW_COLLECTION, tasks: [] }),
  select: async (v) => {
    const tasks = get().isPreset(v) ? await getBuiltinCollection(v) : await loadCustomCollection(v);
    set({ selected: v, tasks });
  },
  save: async (name, tasks) => {
    await saveCustomCollection(name, tasks);
    set({ collections: await listCustomCollections() });
    await get().select(name);
  },
  remove: async (name) => {
    await deleteCustomCollection(name);
    set({ collections: await listCustomCollections() });
    if (get().selected === name) await get().select(DEFAULT_PRESET);
  },
  importFile: async (path) => {
    const name = await importCustomCollection(path);
    set({ collections: await listCustomCollections() });
    await get().select(name);
  },
}));
