import { create } from "zustand";

/// The LLM (TTT) stage's result + **measured** metrics for the voice pipeline
/// (STT → LLM). Durable like [[sttResultStore]] so the Analysis/Inspector can
/// render the breakdown after the user leaves the Workspace. `transcriptId` ties
/// it to the STT result it summarized — the pipeline one-liner only renders when
/// they match, so two stages are never shown mismatched. Every metric is nullable
/// (→ "N/A"), never a fabricated number.
export interface AssistantResult {
  transcriptId: string | null;
  model: string;
  system: string | null;
  output: string;
  ttftMs: number | null;
  tokensPerSec: number | null;
  tokenCount: number;
  /// The model's own reported total (ms), when the backend provides it.
  totalMs: number | null;
  /// Wall-clock from request to done (ms) — always measured.
  wallMs: number;
  /// Triggered by the auto-summarize toggle (vs a manual Ask).
  auto: boolean;
}

interface AssistantResultStore {
  result: AssistantResult | null;
  setResult: (r: AssistantResult) => void;
  clear: () => void;
}

export const useAssistantResultStore = create<AssistantResultStore>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clear: () => set({ result: null }),
}));
