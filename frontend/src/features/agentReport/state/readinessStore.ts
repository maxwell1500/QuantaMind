import { create } from "zustand";
import {
  assessReadiness,
  listReadinessProfiles,
  saveReadinessProfile,
  type ModelVerdict,
  type ReadinessProfile,
} from "../../../shared/ipc/eval/readiness";
import { getHardwareSnapshot, type HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import { defaultCapBytes } from "../capBytes";

interface ReadinessStore {
  profiles: ReadinessProfile[];
  selectedProfileId: string;
  verdicts: ModelVerdict[];
  hardware: HardwareSnapshot | null;
  capBytes: number | null;
  /// True once an assess has completed — distinguishes "not run yet" from a
  /// genuinely empty result (no persisted report) so the page shows the right state.
  assessed: boolean;
  loading: boolean;
  error: string | null;
  loadProfiles: () => Promise<void>;
  loadHardware: () => Promise<void>;
  selectProfile: (id: string) => void;
  setCap: (bytes: number) => void;
  assess: (collectionId: string) => Promise<void>;
  /// Persist edited thresholds to disk (Rust = source of truth) then reload the
  /// profile list so the active profile reflects the new gates.
  saveProfile: (profile: ReadinessProfile) => Promise<void>;
}

/// Transient readiness state — profiles + the current verdicts. Source of truth
/// is Rust (profiles on disk, verdicts computed by `assess_readiness`); this store
/// holds none of it persistently.
export const useReadinessStore = create<ReadinessStore>((set, get) => ({
  profiles: [],
  selectedProfileId: "",
  verdicts: [],
  hardware: null,
  capBytes: null,
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
  loadHardware: async () => {
    // Best-effort: a missing snapshot just leaves VRAM fit unmeasured.
    try {
      const hardware = await getHardwareSnapshot();
      set((s) => ({ hardware, capBytes: s.capBytes ?? defaultCapBytes(hardware) }));
    } catch {
      /* no hardware snapshot — fit stays unmeasured */
    }
  },
  selectProfile: (id) => set({ selectedProfileId: id, assessed: false, verdicts: [] }),
  setCap: (bytes) => set({ capBytes: bytes }),
  assess: async (collectionId) => {
    const { selectedProfileId, capBytes } = get();
    if (!selectedProfileId) return;
    set({ loading: true, error: null });
    try {
      const verdicts = await assessReadiness(collectionId, selectedProfileId, capBytes ?? undefined);
      set({ verdicts, assessed: true, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false, assessed: false });
    }
  },
  saveProfile: async (profile) => {
    await saveReadinessProfile(profile);
    await get().loadProfiles();
  },
}));
