import { create } from "zustand";
import type { HardwareSnapshot } from "../../../shared/ipc/compare/hardware";
import type { StrategyId } from "./strategy";
import { newRow, updateRow, type CompareModel, type CompareRow } from "./compareRow";

export type { CompareModel, CompareRow, RowStatus } from "./compareRow";

interface CompareStore {
  selectedModels: CompareModel[];
  prompt: string;
  systemPrompt: string;
  hardwareSnapshot: HardwareSnapshot | null;
  strategy: StrategyId;
  rows: CompareRow[];
  isRunning: boolean;
  setSelectedModels: (m: CompareModel[]) => void;
  setPrompt: (p: string) => void;
  setSystemPrompt: (p: string) => void;
  setHardwareSnapshot: (s: HardwareSnapshot | null) => void;
  setStrategy: (s: StrategyId) => void;
  initRun: (models: CompareModel[]) => void;
  setRowLoading: (model: string, modelId: string) => void;
  appendToken: (model: string, modelId: string, text: string) => void;
  setRowDone: (p: { model: string; ttft_ms: number | null; tokens_per_sec: number | null; token_count: number }) => void;
  setRowCancelled: (p: { model: string; token_count: number }) => void;
  setRowError: (p: { model: string; kind: string; message: string }) => void;
  setSingleRun: (row: CompareRow) => void;
  finishRun: () => void;
  reset: () => void;
}

export const useCompareStore = create<CompareStore>((set) => ({
  selectedModels: [],
  prompt: "",
  systemPrompt: "",
  hardwareSnapshot: null,
  strategy: "sequential",
  rows: [],
  isRunning: false,
  setSelectedModels: (selectedModels) => set({ selectedModels }),
  setPrompt: (prompt) => set({ prompt }),
  setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
  setHardwareSnapshot: (hardwareSnapshot) => set({ hardwareSnapshot }),
  setStrategy: (strategy) => set({ strategy }),
  initRun: (models) =>
    set({ rows: models.map((m) => newRow(m.name)), isRunning: true }),
  setRowLoading: (model, modelId) =>
    set((s) => ({
      rows: s.rows.map((r) => r.model === model && r.status === "pending"
        ? { ...r, status: "loading", modelId: r.modelId ?? modelId }
        : r),
    })),
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
  // Bridge a single (run_prompt) run into the rows the Analysis tab reads, so a
  // 1-model run shows there like a one-column compare.
  setSingleRun: (row) => set({ rows: [row], isRunning: row.status === "running" }),
  finishRun: () =>
    set((s) => ({
      isRunning: false,
      rows: s.rows.map((r) => r.status === "pending" ? { ...r, status: "cancelled", endedAt: new Date().toISOString() } : r),
    })),
  reset: () => set({
    selectedModels: [], prompt: "", systemPrompt: "", hardwareSnapshot: null,
    strategy: "sequential", rows: [], isRunning: false,
  }),
}));
