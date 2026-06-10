import { create } from "zustand";

export type RunningSttEngine = "whisper_cpp" | null;

/// Live whisper.cpp STT-server health, written by the header's polling hook
/// (useSttServer) so any component (e.g. the Workspace auto-route) can read
/// whether the STT server is running without re-polling. Mirrors how
/// backendStore holds the LLM health flags.
interface SttRuntimeStore {
  whisperHealthy: boolean | null;
  setWhisperHealthy: (h: boolean | null) => void;
}

export const useSttRuntimeStore = create<SttRuntimeStore>((set) => ({
  whisperHealthy: null,
  setWhisperHealthy: (whisperHealthy) => set({ whisperHealthy }),
}));

/// Whether the (whisper.cpp) STT server is currently up, or null.
export function runningSttEngine(s: { whisperHealthy: boolean | null }): RunningSttEngine {
  return s.whisperHealthy === true ? "whisper_cpp" : null;
}
