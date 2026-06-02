import { create } from "zustand";
import type { EvalTask, EvalRunResult } from "../../../shared/ipc/eval/evals";

export interface EvalStore {
  tasks: EvalTask[];
  results: Record<string, EvalRunResult>;
  running: boolean;
  currentId: string | null;
  error: string | null;
  setTasks: (t: EvalTask[]) => void;
  setResult: (r: EvalRunResult) => void;
  setRunning: (running: boolean, currentId?: string | null) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useEvalStore = create<EvalStore>((set) => ({
  tasks: [],
  results: {},
  running: false,
  currentId: null,
  error: null,
  setTasks: (tasks) => set({ tasks }),
  setResult: (r) => set((s) => ({ results: { ...s.results, [r.task_id]: r } })),
  setRunning: (running, currentId = null) => set({ running, currentId }),
  setError: (error) => set({ error }),
  reset: () => set({ results: {}, error: null, currentId: null }),
}));

/// Aggregate pass-rate over the results gathered so far.
export function passRate(results: Record<string, EvalRunResult>): { passed: number; total: number } {
  const vals = Object.values(results);
  return { passed: vals.filter((r) => r.passed).length, total: vals.length };
}
