import { create } from "zustand";

/// The global STT model selection (whisper.cpp). Its own axis, independent of the
/// LLM backend — one LLM + one STT run in parallel.
interface SttSelectionStore {
  /// whisper.cpp catalog id (e.g. "tiny.en").
  selectedSttModelId: string | null;
  setSelectedSttModelId: (id: string | null) => void;
}

export const useSttSelectionStore = create<SttSelectionStore>((set) => ({
  selectedSttModelId: null,
  setSelectedSttModelId: (selectedSttModelId) => set({ selectedSttModelId }),
}));
