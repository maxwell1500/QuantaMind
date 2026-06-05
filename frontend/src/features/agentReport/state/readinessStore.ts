import { create } from "zustand";
import {
  assessReadiness,
  listReadinessProfiles,
  type ModelVerdict,
  type ReadinessProfile,
} from "../../../shared/ipc/eval/readiness";

interface ReadinessStore {
  profiles: ReadinessProfile[];
  selectedProfileId: string;
  verdicts: ModelVerdict[];
  /// True once an assess has completed — distinguishes "not run yet" from a
  /// genuinely empty result (no persisted report) so the page shows the right state.
  assessed: boolean;
  loading: boolean;
  error: string | null;
  loadProfiles: () => Promise<void>;
  selectProfile: (id: string) => void;
  assess: (collectionId: string) => Promise<void>;
}

/// Transient readiness state — profiles + the current verdicts. Source of truth
/// is Rust (profiles on disk, verdicts computed by `assess_readiness`); this store
/// holds none of it persistently.
export const useReadinessStore = create<ReadinessStore>((set, get) => ({
  profiles: [],
  selectedProfileId: "",
  verdicts: [],
  assessed: false,
  loading: false,
  error: null,
  loadProfiles: async () => {
    try {
      const profiles = await listReadinessProfiles();
      set((s) => ({ profiles, selectedProfileId: s.selectedProfileId || profiles[0]?.id || "" }));
    } catch (e) {
      set({ error: String(e) });
    }
  },
  selectProfile: (id) => set({ selectedProfileId: id, assessed: false, verdicts: [] }),
  assess: async (collectionId) => {
    const { selectedProfileId } = get();
    if (!selectedProfileId) return;
    set({ loading: true, error: null });
    try {
      const verdicts = await assessReadiness(collectionId, selectedProfileId);
      set({ verdicts, assessed: true, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false, assessed: false });
    }
  },
}));
