import { create } from "zustand";
import type { HardwareSnapshot } from "../../../shared/ipc/hardware";

export type CompareModel = {
  name: string;
  size_bytes: number;
};

interface CompareStore {
  selectedModels: CompareModel[];
  prompt: string;
  hardwareSnapshot: HardwareSnapshot | null;
  setSelectedModels: (m: CompareModel[]) => void;
  setPrompt: (p: string) => void;
  setHardwareSnapshot: (s: HardwareSnapshot | null) => void;
  reset: () => void;
}

export const useCompareStore = create<CompareStore>((set) => ({
  selectedModels: [],
  prompt: "",
  hardwareSnapshot: null,
  setSelectedModels: (selectedModels) => set({ selectedModels }),
  setPrompt: (prompt) => set({ prompt }),
  setHardwareSnapshot: (hardwareSnapshot) => set({ hardwareSnapshot }),
  reset: () => set({ selectedModels: [], prompt: "", hardwareSnapshot: null }),
}));
