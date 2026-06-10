import { create } from "zustand";

export type RunningSttEngine = "whisper_cpp" | "mlx_audio" | null;

/// Live STT-server health, written by the header's polling hooks
/// (useSttServer / useMlxSttServer) so any component (e.g. the Workspace
/// auto-route) can read whether an STT server is running without re-polling.
/// Mirrors how backendStore holds the LLM health flags.
interface SttRuntimeStore {
  whisperHealthy: boolean | null;
  mlxSttHealthy: boolean | null;
  setWhisperHealthy: (h: boolean | null) => void;
  setMlxSttHealthy: (h: boolean | null) => void;
}

export const useSttRuntimeStore = create<SttRuntimeStore>((set) => ({
  whisperHealthy: null,
  mlxSttHealthy: null,
  setWhisperHealthy: (whisperHealthy) => set({ whisperHealthy }),
  setMlxSttHealthy: (mlxSttHealthy) => set({ mlxSttHealthy }),
}));

/// Which STT engine's server is currently up (whisper takes precedence), or null.
export function runningSttEngine(s: {
  whisperHealthy: boolean | null;
  mlxSttHealthy: boolean | null;
}): RunningSttEngine {
  if (s.whisperHealthy === true) return "whisper_cpp";
  if (s.mlxSttHealthy === true) return "mlx_audio";
  return null;
}
