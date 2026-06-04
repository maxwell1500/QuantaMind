import { create } from "zustand";
import type { BackendKind } from "../ipc/models/storage";
import { useSelectedModelStore } from "./selectedModelStore";

/// Global backend selection + per-backend server health. App-shell state (see
/// architecture.md rule 7): the selected backend drives which models the header
/// can list and which server start/stop control shows. Health is null until the
/// first probe, then true/false. Switching the backend reconciles the global
/// model in Phase 3 (a mismatched model is nulled inside setSelectedBackend).
export interface BackendStore {
  selectedBackend: BackendKind;
  ollamaHealthy: boolean | null;
  llamaHealthy: boolean | null;
  mlxHealthy: boolean | null;
  setSelectedBackend: (b: BackendKind) => void;
  setOllamaHealthy: (h: boolean) => void;
  setLlamaHealthy: (h: boolean) => void;
  setMlxHealthy: (h: boolean) => void;
  isHealthy: (b: BackendKind) => boolean | null;
}

export const useBackendStore = create<BackendStore>((set, get) => ({
  selectedBackend: "ollama",
  ollamaHealthy: null,
  llamaHealthy: null,
  mlxHealthy: null,
  setSelectedBackend: (selectedBackend) => {
    set({ selectedBackend });
    // Reconcile the global selection: a model is bound to its backend's weight
    // format, so models from another backend can't run here. Trim the list to the
    // new backend (the header re-selects on it). Imperative — no cross-store
    // subscription, no render loop.
    const { selectedModels, setSelectedModels } = useSelectedModelStore.getState();
    const kept = selectedModels.filter((m) => m.backend === selectedBackend);
    if (kept.length !== selectedModels.length) setSelectedModels(kept);
  },
  setOllamaHealthy: (h) => set({ ollamaHealthy: h }),
  setLlamaHealthy: (h) => set({ llamaHealthy: h }),
  setMlxHealthy: (h) => set({ mlxHealthy: h }),
  isHealthy: (b) => {
    const s = get();
    return b === "ollama" ? s.ollamaHealthy : b === "mlx" ? s.mlxHealthy : s.llamaHealthy;
  },
}));
