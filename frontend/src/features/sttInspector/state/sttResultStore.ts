import { create } from "zustand";
import type { Transcript } from "../../../shared/ipc/stt/transcribe";

/// Durable home for the last completed transcript. Unlike `transcriptStore` (the
/// transient live view, reset on STT-mode unmount), this survives tab navigation so
/// the Analysis/Inspector STT sections can render after the user leaves the Workspace.
/// Mirrors how `compareStore` is the durable home for finished LLM runs.
interface SttResultStore {
  result: Transcript | null;
  setResult: (t: Transcript) => void;
  clear: () => void;
}

export const useSttResultStore = create<SttResultStore>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clear: () => set({ result: null }),
}));
