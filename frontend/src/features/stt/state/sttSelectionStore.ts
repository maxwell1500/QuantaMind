import { create } from "zustand";

/// The globally-selected STT model id (the one the header's play button starts).
/// Its own axis, independent of the LLM backend selection — one LLM + one STT
/// run in parallel.
interface SttSelectionStore {
  selectedSttModelId: string | null;
  setSelectedSttModelId: (id: string | null) => void;
}

export const useSttSelectionStore = create<SttSelectionStore>((set) => ({
  selectedSttModelId: null,
  setSelectedSttModelId: (selectedSttModelId) => set({ selectedSttModelId }),
}));
