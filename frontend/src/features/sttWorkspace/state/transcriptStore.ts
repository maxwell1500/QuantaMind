import { create } from "zustand";
import type { Segment, Transcript } from "../../../shared/ipc/stt/transcribe";

export type TranscribeStatus = "idle" | "transcribing" | "done" | "error";

/// Transient live-transcript state. The on-disk artifact (Rust) is the source of
/// truth — this is cleared on unmount and repopulated from disk via loadTranscript.
interface TranscriptStore {
  status: TranscribeStatus;
  segments: Segment[];
  language: string | null;
  /// Reference script. `null` = no reference (first-class, drives P4 scoring),
  /// never coerced to "".
  reference: string | null;
  processed: number;
  total: number;
  error: string | null;
  currentId: string | null;
  reset: () => void;
  setStatus: (s: TranscribeStatus) => void;
  appendSegments: (segs: Segment[]) => void;
  setProgress: (processed: number, total: number) => void;
  setReference: (text: string) => void;
  setError: (e: string) => void;
  loadFrom: (t: Transcript) => void;
  setCurrentId: (id: string | null) => void;
}

export const useTranscriptStore = create<TranscriptStore>((set) => ({
  status: "idle",
  segments: [],
  language: null,
  reference: null,
  processed: 0,
  total: 0,
  error: null,
  currentId: null,
  reset: () => set({ status: "idle", segments: [], language: null, processed: 0, total: 0, error: null }),
  setStatus: (status) => set({ status }),
  appendSegments: (segs) => set((s) => ({ segments: [...s.segments, ...segs] })),
  setProgress: (processed, total) => set({ processed, total }),
  setReference: (text) => set({ reference: text === "" ? null : text }),
  setError: (error) => set({ error, status: "error" }),
  loadFrom: (t) =>
    set({ segments: t.segments, language: t.language, status: "done", currentId: t.id }),
  setCurrentId: (currentId) => set({ currentId }),
}));
