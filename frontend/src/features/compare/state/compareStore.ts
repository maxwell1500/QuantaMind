import { create } from "zustand";

export type CompareModel = {
  name: string;
  size_bytes: number;
};

interface CompareStore {
  selectedModels: CompareModel[];
  prompt: string;
  setSelectedModels: (m: CompareModel[]) => void;
  setPrompt: (p: string) => void;
  reset: () => void;
}

export const useCompareStore = create<CompareStore>((set) => ({
  selectedModels: [],
  prompt: "",
  setSelectedModels: (selectedModels) => set({ selectedModels }),
  setPrompt: (prompt) => set({ prompt }),
  reset: () => set({ selectedModels: [], prompt: "" }),
}));
