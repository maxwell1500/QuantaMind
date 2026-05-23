import { create } from "zustand";
import type { HardwareSnapshot } from "../../../shared/ipc/hardware";

export type CompareModel = { name: string; size_bytes: number };
export type RowStatus = "pending" | "running" | "done" | "cancelled" | "error";

export interface CompareRow {
  model: string;
  modelId: string | null;
  status: RowStatus;
  output: string;
  metrics: { ttft_ms: number | null; tokens_per_sec: number | null; token_count: number } | null;
  error: { kind: string; message: string } | null;
  startedAt: string | null;
  endedAt: string | null;
}

interface CompareStore {
  selectedModels: CompareModel[];
  prompt: string;
  hardwareSnapshot: HardwareSnapshot | null;
  rows: CompareRow[];
  isRunning: boolean;
  setSelectedModels: (m: CompareModel[]) => void;
  setPrompt: (p: string) => void;
  setHardwareSnapshot: (s: HardwareSnapshot | null) => void;
  initRun: (models: CompareModel[]) => void;
  appendToken: (model: string, modelId: string, text: string) => void;
  setRowDone: (p: { model: string; ttft_ms: number | null; tokens_per_sec: number | null; token_count: number }) => void;
  setRowCancelled: (p: { model: string; token_count: number }) => void;
  setRowError: (p: { model: string; kind: string; message: string }) => void;
  finishRun: () => void;
  reset: () => void;
}

const newRow = (model: string): CompareRow => ({
  model, modelId: null, status: "pending", output: "",
  metrics: null, error: null, startedAt: null, endedAt: null,
});

const updateRow = (rows: CompareRow[], model: string, patch: Partial<CompareRow>): CompareRow[] =>
  rows.map((r) => (r.model === model ? { ...r, ...patch } : r));

export const useCompareStore = create<CompareStore>((set) => ({
  selectedModels: [],
  prompt: "",
  hardwareSnapshot: null,
  rows: [],
  isRunning: false,
  setSelectedModels: (selectedModels) => set({ selectedModels }),
  setPrompt: (prompt) => set({ prompt }),
  setHardwareSnapshot: (hardwareSnapshot) => set({ hardwareSnapshot }),
  initRun: (models) =>
    set({ rows: models.map((m) => newRow(m.name)), isRunning: true }),
  appendToken: (model, modelId, text) =>
    set((s) => ({
      rows: s.rows.map((r) => r.model === model
        ? { ...r, status: "running", modelId: r.modelId ?? modelId, output: r.output + text,
            startedAt: r.startedAt ?? new Date().toISOString() }
        : r),
    })),
  setRowDone: (p) =>
    set((s) => ({
      rows: updateRow(s.rows, p.model, {
        status: "done",
        metrics: { ttft_ms: p.ttft_ms, tokens_per_sec: p.tokens_per_sec, token_count: p.token_count },
        endedAt: new Date().toISOString(),
      }),
    })),
  setRowCancelled: (p) =>
    set((s) => ({ rows: updateRow(s.rows, p.model, { status: "cancelled", endedAt: new Date().toISOString() }) })),
  setRowError: (p) =>
    set((s) => ({
      rows: updateRow(s.rows, p.model, {
        status: "error",
        error: { kind: p.kind, message: p.message },
        endedAt: new Date().toISOString(),
      }),
    })),
  finishRun: () =>
    set((s) => ({
      isRunning: false,
      rows: s.rows.map((r) => r.status === "pending" ? { ...r, status: "cancelled", endedAt: new Date().toISOString() } : r),
    })),
  reset: () => set({ selectedModels: [], prompt: "", hardwareSnapshot: null, rows: [], isRunning: false }),
}));
