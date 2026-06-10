import { create } from "zustand";

export type SttEngine = "whisper_cpp" | "mlx_audio";

/// The global STT selection: which engine (whisper.cpp / mlx-audio) and which
/// model per engine. Its own axis, independent of the LLM backend — one LLM +
/// one STT run in parallel.
interface SttSelectionStore {
  engine: SttEngine;
  setEngine: (e: SttEngine) => void;
  /// whisper.cpp catalog id (e.g. "tiny.en").
  selectedSttModelId: string | null;
  setSelectedSttModelId: (id: string | null) => void;
  /// mlx-audio repo id (e.g. "mlx-community/whisper-large-v3-turbo-q4").
  selectedMlxSttRepo: string | null;
  setSelectedMlxSttRepo: (r: string | null) => void;
}

export const useSttSelectionStore = create<SttSelectionStore>((set) => ({
  engine: "whisper_cpp",
  setEngine: (engine) => set({ engine }),
  selectedSttModelId: null,
  setSelectedSttModelId: (selectedSttModelId) => set({ selectedSttModelId }),
  selectedMlxSttRepo: null,
  setSelectedMlxSttRepo: (selectedMlxSttRepo) => set({ selectedMlxSttRepo }),
}));
